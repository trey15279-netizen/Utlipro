"use strict";
// Agent Hub: create AI agents, put them in rooms, and let them talk to each other.
// Models run locally through Ollama, so there are no API keys.
const http = require("http");
const fs = require("fs");
const path = require("path");
const storeLib = require("./lib/store");
const llmLib = require("./lib/llm");
const { createRunner } = require("./lib/runner");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function clean(v, max) { return String(v == null ? "" : v).trim().slice(0, max); }
function validColor(c) { return /^#[0-9a-f]{6}$/i.test(c || ""); }

function createApp(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const baseUrl = (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const defaultModel = env.DEFAULT_MODEL || "llama3.2";
  const llm = opts.llm || llmLib;
  const store = storeLib.open(opts.dbPath || env.DATABASE_PATH || path.join(__dirname, "data", "agents.db"), defaultModel);
  const publicDir = path.join(__dirname, "public");
  const streams = new Map(); // roomId -> Set<res>

  function emit(roomId, event, data) {
    const set = streams.get(roomId);
    if (!set) return;
    const line = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
    for (const res of set) res.write(line);
  }
  const runner = createRunner({ store, llm, baseUrl, emit });
  const ping = setInterval(() => { for (const set of streams.values()) for (const r of set) r.write(": ping\n\n"); }, 25000);
  ping.unref();

  function send(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  }
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on("data", (c) => { size += c.length; if (size > 256 * 1024) { reject(new HttpError(413, "Too large.")); req.destroy(); } else chunks.push(c); });
      req.on("end", () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) || {}); } catch (e) { reject(new HttpError(400, "Couldn't read that request.")); }
      });
      req.on("error", reject);
    });
  }

  function agentInput(b, partial) {
    const out = {};
    if (!partial || b.name !== undefined) {
      out.name = clean(b.name, 40);
      if (!out.name) throw new HttpError(400, "Give the agent a name.");
      if (!/^[\w][\w .'-]*$/.test(out.name)) throw new HttpError(400, "Use letters, numbers, spaces, dots, dashes or apostrophes in the name.");
    }
    if (b.role !== undefined) out.role = clean(b.role, 120);
    if (b.prompt !== undefined) out.prompt = clean(b.prompt, 4000);
    if (b.model !== undefined) { out.model = clean(b.model, 100); if (!out.model) throw new HttpError(400, "Pick a model."); }
    if (b.color !== undefined) { if (!validColor(b.color)) throw new HttpError(400, "Color should look like #5b6cff."); out.color = b.color; }
    return out;
  }
  function roomView(room) {
    return Object.assign({}, room, { agents: store.roomAgents(room.id), messages: store.messages(room.id), running: runner.isRunning(room.id) });
  }

  // ---------- Routes ----------
  const routes = [];
  function route(method, pattern, fn) {
    const keys = [];
    const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ method, rx, keys, fn });
  }

  route("GET", "/api/status", async (req, res) => {
    const models = await llm.listModels(baseUrl);
    send(res, 200, { ollama: models !== null, models: models || [], baseUrl, defaultModel });
  });

  route("GET", "/api/agents", async (req, res) => send(res, 200, store.listAgents()));
  route("POST", "/api/agents", async (req, res, p, b) => {
    try { send(res, 201, store.createAgent(agentInput(b, false))); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, "There's already an agent with that name."); throw e; }
  });
  route("PATCH", "/api/agents/:id", async (req, res, p, b) => {
    if (!store.getAgent(p.id)) throw new HttpError(404, "That agent doesn't exist.");
    try { send(res, 200, store.updateAgent(p.id, agentInput(b, true))); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, "There's already an agent with that name."); throw e; }
  });
  route("DELETE", "/api/agents/:id", async (req, res, p) => { store.deleteAgent(p.id); send(res, 200, { ok: true }); });

  route("GET", "/api/rooms", async (req, res) => send(res, 200, store.listRooms().map((r) => Object.assign(r, { running: runner.isRunning(r.id) }))));
  route("POST", "/api/rooms", async (req, res, p, b) => {
    const title = clean(b.title, 80);
    const ids = Array.isArray(b.agentIds) ? [...new Set(b.agentIds.map(String))] : [];
    if (!title) throw new HttpError(400, "Give the room a name.");
    if (!ids.length) throw new HttpError(400, "Pick at least one agent.");
    if (ids.some((aid) => !store.getAgent(aid))) throw new HttpError(400, "One of those agents doesn't exist anymore.");
    send(res, 201, roomView(store.createRoom({ title, topic: clean(b.topic, 1000), agentIds: ids })));
  });
  route("GET", "/api/rooms/:id", async (req, res, p) => {
    const room = store.getRoom(p.id);
    if (!room) throw new HttpError(404, "That room doesn't exist.");
    send(res, 200, roomView(room));
  });
  route("DELETE", "/api/rooms/:id", async (req, res, p) => { runner.stop(p.id); store.deleteRoom(p.id); send(res, 200, { ok: true }); });

  route("POST", "/api/rooms/:id/messages", async (req, res, p, b) => {
    if (!store.getRoom(p.id)) throw new HttpError(404, "That room doesn't exist.");
    const content = clean(b.content, 4000);
    if (!content) throw new HttpError(400, "Write a message first.");
    const msg = store.addMessage({ roomId: p.id, author: "You", content });
    emit(p.id, "message", { message: msg });
    send(res, 201, msg);
  });
  route("POST", "/api/rooms/:id/clear", async (req, res, p) => {
    runner.stop(p.id); store.clearMessages(p.id); emit(p.id, "cleared", {}); send(res, 200, { ok: true });
  });
  route("POST", "/api/rooms/:id/run", async (req, res, p, b) => {
    if (!store.getRoom(p.id)) throw new HttpError(404, "That room doesn't exist.");
    const turns = Math.max(1, Math.min(50, Number(b.turns) || 1));
    if (!runner.start(p.id, turns)) throw new HttpError(409, "The agents are already talking in this room.");
    send(res, 202, { ok: true });
  });
  route("POST", "/api/rooms/:id/stop", async (req, res, p) => send(res, 200, { stopped: runner.stop(p.id) }));

  route("GET", "/api/rooms/:id/events", async (req, res, p) => {
    if (!store.getRoom(p.id)) throw new HttpError(404, "That room doesn't exist.");
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 3000\n\n");
    if (!streams.has(p.id)) streams.set(p.id, new Set());
    streams.get(p.id).add(res);
    req.on("close", () => { const s = streams.get(p.id); if (s) { s.delete(res); if (!s.size) streams.delete(p.id); } });
  });

  // ---------- Handler ----------
  async function handle(req, res) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { send(res, 400, { error: "Bad address." }); return; }
    try {
      if (pathname.startsWith("/api/")) {
        const r = routes.find((x) => x.method === req.method && x.rx.test(pathname));
        if (!r) throw new HttpError(404, "Not found.");
        const m = pathname.match(r.rx), params = {};
        r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        let body = {};
        if (req.method === "POST" || req.method === "PATCH") {
          // Only accept JSON so other websites can't send commands to your hub.
          if (!/^application\/json/i.test(req.headers["content-type"] || "")) throw new HttpError(415, "Send JSON.");
          body = await readJson(req);
        }
        await r.fn(req, res, params, body);
        return;
      }
      const file = path.normalize(path.join(publicDir, pathname === "/" ? "index.html" : pathname));
      if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found."); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? "Something went wrong." : e.message });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.store = store;
  server.on("close", () => { clearInterval(ping); runner.stopAll(); for (const s of streams.values()) for (const r of s) r.end(); });
  return server;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || "127.0.0.1";
  const app = createApp();
  app.listen(port, host, async () => {
    console.log("Agent Hub running at http://" + (host === "0.0.0.0" ? "localhost" : host) + ":" + port);
    const models = await llmLib.listModels((process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""));
    if (models === null) console.log("Ollama isn't running yet. Install it from https://ollama.com, then run: ollama pull llama3.2");
    else if (!models.length) console.log("Ollama is running but has no models. Run: ollama pull llama3.2");
    else console.log("Models available: " + models.join(", "));
  });
}
