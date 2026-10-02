"use strict";
// SQLite storage using Node's built-in driver (Node 22.13+), so there are no native packages to install.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  owner TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notify_phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  form_key TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  trial_ends INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_account ON leads(account_id, received_at DESC);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_lead ON activity(lead_id, at);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_lead ON messages(lead_id, at);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  detail TEXT NOT NULL,
  at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notifications_account ON notifications(account_id, at DESC);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  vid TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
CREATE INDEX IF NOT EXISTS events_vid ON events(vid);
CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function open(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Columns added after the first release. Older databases get them on startup.
const ADDED_COLUMNS = {
  accounts: [
    ["twilio_number", "TEXT NOT NULL DEFAULT ''"],
    ["forward_phone", "TEXT NOT NULL DEFAULT ''"],
    ["attribution", "TEXT NOT NULL DEFAULT '{}'"]
  ]
};
function migrate(db) {
  Object.keys(ADDED_COLUMNS).forEach((table) => {
    const have = new Set(db.prepare("PRAGMA table_info(" + table + ")").all().map((c) => c.name));
    ADDED_COLUMNS[table].forEach(([name, type]) => {
      if (!have.has(name)) db.exec("ALTER TABLE " + table + " ADD COLUMN " + name + " " + type);
    });
  });
}

// Run fn inside a transaction.
function tx(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

module.exports = { open, tx };
