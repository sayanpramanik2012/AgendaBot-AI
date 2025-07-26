# AI Calendar Assistant

A full-stack web application that combines an AI-powered chat assistant with Google Calendar integration. Users can chat with the AI to manage their schedule, ask about events, and get productivity help—all in a modern, responsive interface.

---

## Features

### 🧠 AI Chat Assistant

- Chat with an AI that understands your schedule and can answer questions about your calendar.
- Natural language support for event times, conflicts, suggestions, and more.

### 📅 Google Calendar Integration

- Sign in with Google to securely connect your calendar.
- View, discuss, and get insights about your daily events.

### 💬 Multi-Session Chat

- Start new chat sessions and revisit previous conversations.
- Each session keeps its own history.

### ⚡ Modern UI

- Responsive, clean Angular frontend.
- Sidebar for session management, main area for chat.

---

## Architecture Overview

```
[User] ⇄ [Angular Frontend] ⇄ [Express Backend/API] ⇄ [SQLite DB]
                                         │
                                         └── Google Calendar & Gemini AI
```

- **Frontend:** Angular 20, SCSS, RxJS
- **Backend:** Node.js (Express), SQLite, Google APIs, Gemini AI

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- Google Cloud project with Calendar API enabled
- Gemini API key (for AI)

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd ai-chat
```

### 2. Backend Setup

```bash
cd backend
npm install
# Create a .env file with the following:
# GEMINI_API_KEY=your_gemini_api_key
# GOOGLE_CLIENT_ID=your_google_client_id
# GOOGLE_CLIENT_SECRET=your_google_client_secret
# OAUTH_CALLBACK_URL=http://localhost:3000/auth/google/callback
# SESSION_SECRET=your_random_secret
node index.js
```

- The backend runs on `http://localhost:3000` by default.

### 3. Frontend Setup

```bash
cd ../frontend
npm install
ng serve
```

- The frontend runs on `http://localhost:4200` by default.

---

## Usage

1. Open `http://localhost:4200` in your browser.
2. Sign in with your Google account.
3. Start chatting! Ask about your schedule, create new chat sessions, and get AI-powered calendar help.

---

## Backend Details

- **Express API** with endpoints for:
  - `/auth/google` and `/auth/google/callback` (OAuth2 login)
  - `/api/session` (check login)
  - `/api/sessions` (list/create chat sessions)
  - `/api/sessions/:sessionId/messages` (get messages)
  - `/api/chat` (AI chat endpoint, streams responses)
  - `/api/calendar/today` (fetch today’s events)
- **Database:** SQLite with tables for users, chat sessions, messages, and OAuth tokens.
- **AI Model:** Google Gemini (via `@google/generative-ai`)
- **Calendar:** Google Calendar API (read-only)

---

## Frontend Details

- **Angular 20** SPA
- **Chat UI:** Modern, responsive, with sidebar for sessions and main area for chat
- **Service Layer:** Handles API calls, session management, and streaming chat responses
- **Authentication:** Google OAuth2 (handled via backend)

---

## Environment Variables

Backend `.env` example:

```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=your_random_secret
```

---

## Credits

- [Angular](https://angular.io/)
- [Express](https://expressjs.com/)
- [Google Gemini AI](https://ai.google.dev/)
- [Google Calendar API](https://developers.google.com/calendar)
