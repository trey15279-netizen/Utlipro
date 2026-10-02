"use strict";
// Agent Hub storage: agents, rooms (group conversations), and messages, in SQLite built into Node 22.13+.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b6cff',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_agents (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (room_id, agent_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_room ON messages(room_id, id);
`;

const STARTER_AGENTS = [
  { name: "Planner", role: "Breaks big goals into clear steps", color: "#5b6cff",
    prompt: "You turn ideas into practical step-by-step plans. You are organized and concrete, and you always end with the next action." },
  { name: "Critic", role: "Finds weak spots and risks", color: "#e5484d",
    prompt: "You look for what could go wrong: hidden costs, risks, bad assumptions. You are direct but fair, and you suggest a fix for each problem you raise." },
  { name: "Builder", role: "Gets hands-on and creative", color: "#12a594",
    prompt: "You come up with creative, hands-on ways to make things happen with little money. You like quick experiments over long debates." }
];

function id() { return crypto.randomBytes(8).toString("base64url"); }

function open(file, defaultModel) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  // A message left mid-reply when the server stopped can never finish.
  db.prepare("UPDATE messages SET status = 'stopped' WHERE status = 'streaming'").run();

  const store = {
    db,

    // ---------- Agents ----------
    listAgents() { return db.prepare("SELECT * FROM agents ORDER BY created_at, rowid").all(); },
    getAgent(agentId) { return db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) || null; },
    createAgent(a) {
      const row = { id: id(), name: a.name, role: a.role || "", prompt: a.prompt || "", model: a.model || defaultModel, color: a.color || "#5b6cff", created_at: Date.now() };
      db.prepare("INSERT INTO agents (id, name, role, prompt, model, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(row.id, row.name, row.role, row.prompt, row.model, row.color, row.created_at);
      return row;
    },
    updateAgent(agentId, fields) {
      const allowed = ["name", "role", "prompt", "model", "color"], sets = [], vals = [];
      allowed.forEach((k) => { if (fields[k] !== undefined) { sets.push(k + " = ?"); vals.push(fields[k]); } });
      if (sets.length) db.prepare("UPDATE agents SET " + sets.join(", ") + " WHERE id = ?").run(...vals, agentId);
      return store.getAgent(agentId);
    },
    deleteAgent(agentId) { db.prepare("DELETE FROM agents WHERE id = ?").run(agentId); },

    // ---------- Rooms ----------
    listRooms() {
      return db.prepare(
        "SELECT r.*, (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id) AS message_count, " +
        "(SELECT MAX(at) FROM messages m WHERE m.room_id = r.id) AS last_at FROM rooms r ORDER BY COALESCE(last_at, r.created_at) DESC"
      ).all();
    },
    getRoom(roomId) { return db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId) || null; },
    roomAgents(roomId) {
      return db.prepare("SELECT a.* FROM room_agents ra JOIN agents a ON a.id = ra.agent_id WHERE ra.room_id = ? ORDER BY ra.position").all(roomId);
    },
    createRoom(r) {
      const row = { id: id(), title: r.title, topic: r.topic || "", created_at: Date.now() };
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO rooms (id, title, topic, created_at) VALUES (?, ?, ?, ?)").run(row.id, row.title, row.topic, row.created_at);
        r.agentIds.forEach((aid, i) => db.prepare("INSERT INTO room_agents (room_id, agent_id, position) VALUES (?, ?, ?)").run(row.id, aid, i));
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return row;
    },
    deleteRoom(roomId) { db.prepare("DELETE FROM rooms WHERE id = ?").run(roomId); },

    // ---------- Messages ----------
    messages(roomId) { return db.prepare("SELECT * FROM messages WHERE room_id = ? ORDER BY id").all(roomId); },
    addMessage(m) {
      const at = Date.now();
      const r = db.prepare("INSERT INTO messages (room_id, agent_id, author, content, status, at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(m.roomId, m.agentId || null, m.author, m.content || "", m.status || "done", at);
      return { id: Number(r.lastInsertRowid), room_id: m.roomId, agent_id: m.agentId || null, author: m.author, content: m.content || "", status: m.status || "done", at };
    },
    finishMessage(msgId, content, status) { db.prepare("UPDATE messages SET content = ?, status = ? WHERE id = ?").run(content, status, msgId); },
    clearMessages(roomId) { db.prepare("DELETE FROM messages WHERE room_id = ?").run(roomId); }
  };

  if (!db.prepare("SELECT 1 FROM agents LIMIT 1").get()) STARTER_AGENTS.forEach((a) => store.createAgent(a));
  return store;
}

module.exports = { open, STARTER_AGENTS };
