import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize SQLite database
const db = new Database(join(__dirname, "data", "chat.db"));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    google_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
`);

// Prepared statements for better performance
const statements = {
  // Users
  createUser: db.prepare(`
    INSERT INTO users (id, email, name, google_id) 
    VALUES (?, ?, ?, ?)
  `),
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),

  // Chat Sessions
  createSession: db.prepare(`
    INSERT INTO chat_sessions (id, user_id, title) 
    VALUES (?, ?, ?)
  `),
  getUserSessions: db.prepare(`
    SELECT * FROM chat_sessions 
    WHERE user_id = ? 
    ORDER BY updated_at DESC
  `),
  updateSessionTitle: db.prepare(`
    UPDATE chat_sessions 
    SET title = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `),
  updateSessionTimestamp: db.prepare(`
    UPDATE chat_sessions 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `),

  // Messages
  createMessage: db.prepare(`
    INSERT INTO messages (id, session_id, role, content) 
    VALUES (?, ?, ?, ?)
  `),
  getSessionMessages: db.prepare(`
    SELECT * FROM messages 
    WHERE session_id = ? 
    ORDER BY created_at ASC
  `),

  // OAuth Tokens
  saveTokens: db.prepare(`
    INSERT OR REPLACE INTO oauth_tokens 
    (id, user_id, access_token, refresh_token, expiry_date) 
    VALUES (?, ?, ?, ?, ?)
  `),
  getTokens: db.prepare("SELECT * FROM oauth_tokens WHERE user_id = ?"),
};

export { db, statements };
