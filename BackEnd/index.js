import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import session from "cookie-session";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import { statements } from "./database.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: "http://localhost:4200", credentials: true }));
app.use(express.json());
app.use(
  session({
    name: "sess",
    keys: [process.env.SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  })
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.OAUTH_CALLBACK_URL
);

// Helper function to ensure user exists
function ensureUser(profile) {
  try {
    let user = statements.getUserByEmail.get(profile.email);
    if (!user) {
      const userId = uuidv4();
      statements.createUser.run(
        userId,
        profile.email,
        profile.name,
        profile.id
      );
      user = statements.getUserById.get(userId);
    }
    return user;
  } catch (error) {
    console.error("Error ensuring user:", error);
    throw error;
  }
}

// Auth routes
app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
  });
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Get user profile
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    // Save user and tokens
    const user = ensureUser(profile);

    // Save tokens to database
    statements.saveTokens.run(
      uuidv4(),
      user.id,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date || null
    );

    req.session.userId = user.id;
    req.session.tokens = tokens;

    res.redirect("http://localhost:4200");
  } catch (error) {
    console.error("Error retrieving tokens:", error);
    res.status(500).send("Authentication failed. Please try again.");
  }
});

// Session check
app.get("/api/session", (req, res) => {
  if (req.session.userId) {
    const user = statements.getUserById.get(req.session.userId);
    res.json({
      authed: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } else {
    res.json({ authed: false });
  }
});

// Get user's chat sessions
app.get("/api/sessions", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessions = statements.getUserSessions.all(req.session.userId);
  res.json(sessions);
});

// Create new chat session
app.post("/api/sessions", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionId = uuidv4();
  const { title = "New Chat" } = req.body;

  statements.createSession.run(sessionId, req.session.userId, title);
  res.json({ id: sessionId, title });
});

// Get messages for a session
app.get("/api/sessions/:sessionId/messages", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const messages = statements.getSessionMessages.all(req.params.sessionId);
  res.json(messages);
});

// Chat endpoint with session support
app.post("/api/chat", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authenticate first" });
  }

  const { messages, sessionId } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Invalid or empty messages array." });
  }

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID required" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:4200");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are a helpful assistant with access to the user's calendar information. 
      When calendar events are shared with you, remember the details and be able to answer questions about:
      - Event times and durations
      - Event locations
      - Event descriptions
      - Conflicts between events
      - Time available between events
      - Suggestions for scheduling
      Answer naturally and conversationally about the calendar events.`,
    });

    const latestUserMessage = messages[messages.length - 1];
    const chatHistory = messages.slice(0, -1);

    // Save user message to database
    statements.createMessage.run(
      uuidv4(),
      sessionId,
      "user",
      latestUserMessage.text
    );

    const formattedHistory = chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
      formattedHistory.length = 0;
    }

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessageStream(latestUserMessage.text);

    let fullResponse = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Save assistant response to database
    statements.createMessage.run(
      uuidv4(),
      sessionId,
      "assistant",
      fullResponse
    );

    // Update session timestamp
    statements.updateSessionTimestamp.run(sessionId);

    res.write(
      `data: ${JSON.stringify({ complete: true, fullText: fullResponse })}\n\n`
    );
    res.end();
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to get response from Gemini." });
    } else {
      res.write(
        `data: ${JSON.stringify({
          error: "An error occurred during streaming.",
        })}\n\n`
      );
      res.end();
    }
  }
});

// Calendar endpoint (unchanged but with token loading from DB)
app.get("/api/calendar/today", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authenticate first" });
  }

  try {
    // Load tokens from database
    const tokenRecord = statements.getTokens.get(req.session.userId);
    if (!tokenRecord) {
      return res.status(401).json({ error: "No tokens found" });
    }

    oauth2Client.setCredentials({
      access_token: tokenRecord.access_token,
      refresh_token: tokenRecord.refresh_token,
      expiry_date: tokenRecord.expiry_date,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    const resCalendar = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const events = (resCalendar.data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary || "No title",
      description: event.description || "",
      location: event.location || "",
      start: event.start,
      end: event.end,
      attendees: event.attendees?.map((a) => a.email) || [],
      organizer: event.organizer?.email || "",
      status: event.status || "",
      htmlLink: event.htmlLink || "",
    }));

    console.log(`Found ${events.length} events for today`);
    res.json(events);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ error: "Failed to fetch calendar events." });
  }
});

app.listen(port, () => console.log(`Backend listening on ${port}`));
