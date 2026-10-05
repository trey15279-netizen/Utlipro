"use strict";
// Command Hub server: serves the marketing site, sign-up/log-in, the lead dashboard,
// a JSON API for the dashboard, and the public form address that customers' websites post leads to.
const http = require("http");
const fs = require("fs");
const path = require("path");
const dbm = require("./lib/db");
const sec = require("./lib/security");
const notify = require("./lib/notify");
const tw = require("./lib/twilio");

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
const TRIAL_DAYS = 14;
const COOKIE = "ch_session";
const STATUSES = ["new", "contacted", "appointment", "won", "lost", "missed"];
const STATUS_LABEL = { new: "New", contacted: "Contacted", appointment: "Appointment", won: "Won", lost: "Lost", missed: "Missed" };
const DEFAULT_SETTINGS = {
  sms: true, email_on: true, sound: true,
  autoReply: true,
  autoReplyText: "Hi {first_name}, thanks for contacting {company}! This is {owner}. I got your request and will call you shortly.",
  missedTextOn: true,
  missedText: "Hi, this is {owner} with {company}. Sorry I missed your call! I'm on a job right now. How can I help? Text back here and I'll get right back to you."
};
const EVENT_TYPES = ["pageview", "cta", "demo", "pricing_view", "signup_start", "signup"];
const STAGES = ["", "Visited", "Viewed pricing", "Clicked demo or trial", "Started sign-up", "Signed up"];
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
  ".mp4": "video/mp4", ".webm": "video/webm"
};
const TEST_LEADS = [
  ["Emily Johnson", "(864) 555-0142", "Storm Damage", "Greenville, SC", "Tree limb came down on the roof last night. Need someone ASAP."],
  ["Marcus Lee", "(864) 555-0193", "Roof Replacement", "Greer, SC", "Looking for a quote on a full replacement this fall."],
  ["Olivia Martinez", "(864) 555-0128", "Leak Repair", "Simpsonville, SC", "Water stain on the bedroom ceiling keeps growing."],
  ["David Wilson", "(864) 555-0176", "Inspection", "Easley, SC", "Need an inspection for an insurance claim."],
  ["Ava Thompson", "(864) 555-0111", "Gutter Repair", "Mauldin, SC", "Gutter on the back of the house is hanging loose."]
];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function createApp(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const db = dbm.open(opts.dbPath || env.DATABASE_PATH || path.join(__dirname, "data", "commandhub.db"));
  const publicDir = path.join(__dirname, "public");
  const secureCookies = env.NODE_ENV === "production";
  const authAllow = sec.limiter(20, 15 * 60 * 1000);
  const formAllow = sec.limiter(30, 10 * 60 * 1000);
  const trackAllow = sec.limiter(300, 10 * 60 * 1000);
  const admins = String(env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const streams = new Map(); // accountId -> Set<res>

  // ---------- Small HTTP helpers ----------
  function send(res, status, body, headers) {
    const isObj = typeof body === "object" && body !== null && !Buffer.isBuffer(body);
    res.writeHead(status, Object.assign({ "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store" }, headers || {}));
    res.end(isObj ? JSON.stringify(body) : body);
  }
  function redirect(res, to) { res.writeHead(302, { Location: to, "Cache-Control": "no-store" }); res.end(); }

  function readRaw(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > limit) { reject(new HttpError(413, "That submission is too large.")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }
  function readBody(req, limit) {
    return readRaw(req, limit).then((raw) => {
      const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      try {
        if (!raw) return {};
        if (type === "application/json") return JSON.parse(raw) || {};
        if (type === "application/x-www-form-urlencoded" || type === "text/plain") return Object.fromEntries(new URLSearchParams(raw));
      } catch (e) { throw new HttpError(400, "The request body could not be read."); }
      throw new HttpError(415, "Send the form as JSON or a standard HTML form.");
    });
  }

  function cookies(req) {
    const out = {};
    String(req.headers.cookie || "").split(";").forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
  }
  function ip(req) { return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(); }
  function baseUrl(req) {
    if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
    const proto = String(req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0];
    return proto + "://" + req.headers.host;
  }

  // ---------- Sessions ----------
  function startSession(res, userId) {
    const t = sec.token(32);
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sec.sha256(t), userId, Date.now() + SESSION_DAYS * DAY);
    res.setHeader("Set-Cookie", COOKIE + "=" + t + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_DAYS * 86400 + (secureCookies ? "; Secure" : ""));
  }
  function endSession(req, res) {
    const t = cookies(req)[COOKIE];
    if (t) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sec.sha256(t));
    res.setHeader("Set-Cookie", COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (secureCookies ? "; Secure" : ""));
  }
  function current(req) {
    const t = cookies(req)[COOKIE];
    if (!t) return null;
    const row = db.prepare(
      "SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email, u.pass_hash, a.* FROM sessions s " +
      "JOIN users u ON u.id = s.user_id JOIN accounts a ON a.id = u.account_id WHERE s.token_hash = ? AND s.expires_at > ?"
    ).get(sec.sha256(t), Date.now());
    return row || null;
  }
  function settingsOf(acct) {
    let s = {};
    try { s = JSON.parse(acct.settings || "{}"); } catch (e) { /* use defaults */ }
    return Object.assign({}, DEFAULT_SETTINGS, s);
  }

  // ---------- Live updates (Server-Sent Events) ----------
  function broadcast(accountId, event, data) {
    const set = streams.get(accountId);
    if (!set) return;
    const msg = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
    for (const res of set) res.write(msg);
  }
  const heartbeat = setInterval(() => {
    for (const set of streams.values()) for (const res of set) res.write(": ping\n\n");
  }, 25000);
  heartbeat.unref();

  // ---------- Leads ----------
  function addActivity(leadId, text, note, at) {
    db.prepare("INSERT INTO activity (lead_id, text, note, at) VALUES (?, ?, ?, ?)").run(leadId, text, note || null, at || Date.now());
  }
  function setStatus(lead, status) {
    if (lead.status === status) return;
    db.prepare("UPDATE leads SET status = ? WHERE id = ?").run(status, lead.id);
    addActivity(lead.id, "Status changed to " + STATUS_LABEL[status]);
    lead.status = status;
  }
  function ownedLead(acct, id) {
    const l = db.prepare("SELECT * FROM leads WHERE id = ? AND account_id = ?").get(id, acct.id);
    if (!l) throw new HttpError(404, "That lead no longer exists.");
    return l;
  }

  function createLead(acct, data, source, req, opts) {
    opts = opts || {};
    const first = clean(data.first_name || data.firstname, 60), last = clean(data.last_name || data.lastname, 60);
    const lead = {
      id: sec.id(),
      name: clean(data.name || data.full_name || data.fullname || (first + " " + last), 120),
      phone: clean(data.phone || data.tel || data.phone_number || data.telephone, 40),
      email: clean(data.email || data.email_address, 200),
      city: clean(data.city || data.address || data.location, 200),
      service: clean(data.service || data.service_needed || data.subject, 120),
      message: cleanText(data.message || data.comments || data.details || data.notes, 4000),
      source: source,
      status: "new",
      received_at: Date.now()
    };
    if (!lead.name) throw new HttpError(400, "Please enter your name.");
    if (!lead.phone && !lead.email) throw new HttpError(400, "Please enter a phone number or email so we can reach you.");
    if (lead.email && !validEmail(lead.email)) throw new HttpError(400, "Please enter a valid email address.");

    dbm.tx(db, () => {
      db.prepare("INSERT INTO leads (id, account_id, name, phone, email, city, service, message, source, status, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(lead.id, acct.id, lead.name, lead.phone, lead.email, lead.city, lead.service, lead.message, lead.source, lead.status, lead.received_at);
      addActivity(lead.id, "Lead received from " + (source === "Test Lead" ? "a test submission" : source), null, lead.received_at);
      db.prepare("INSERT INTO notifications (id, account_id, lead_id, text, detail, at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(sec.id(), acct.id, lead.id, "New lead received", lead.name + (lead.service ? " • " + lead.service : ""), lead.received_at);
    });

    broadcast(acct.id, "lead", { id: lead.id, name: lead.name, phone: lead.phone, service: lead.service, receivedAt: lead.received_at });

    const appUrl = baseUrl(req);
    notify.alertNewLead(env, acct, lead, settingsOf(acct), appUrl).then((results) => {
      if (!results.length) return;
      const exists = db.prepare("SELECT 1 FROM leads WHERE id = ?").get(lead.id);
      if (!exists) return;
      results.forEach((r) => addActivity(lead.id, r.text));
      broadcast(acct.id, "update", { leadId: lead.id });
    }).catch((e) => console.error("alert error", e));

    const s = settingsOf(acct);
    if (s.autoReply && lead.phone && !opts.noAutoReply) {
      const text = fill(s.autoReplyText, acct, lead);
      if (source === "Test Lead") {
        db.prepare("INSERT INTO messages (lead_id, sender, text, at) VALUES (?, 'auto', ?, ?)").run(lead.id, withOptOut(text), Date.now());
        addActivity(lead.id, "Auto-reply preview (test leads aren't texted)");
      } else if (!notify.smsConfigured(env)) {
        addActivity(lead.id, "Auto-reply skipped: texting is not set up on the server yet");
      } else {
        autoText(acct, lead.id, lead.phone, text, "Auto-reply");
      }
    }
    return lead;
  }

  // ---------- Automatic texts ----------
  function fill(tpl, acct, lead) {
    const first = lead ? String(lead.name || "").split(" ")[0] : "";
    const vals = { first_name: first || "there", name: (lead && lead.name) || "", company: acct.company, owner: String(acct.owner || "").split(" ")[0],
      service: lead && lead.service ? String(lead.service).toLowerCase() : "your request" };
    return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
  }
  function withOptOut(text) { return /\bstop\b/i.test(text) ? text : text + " Reply STOP to opt out."; }
  function autoText(acct, leadId, to, text, kind) {
    const body = withOptOut(text);
    return notify.sendSms(env, to, body, acct.twilio_number || undefined).then(() => {
      db.prepare("INSERT INTO messages (lead_id, sender, text, at) VALUES (?, 'auto', ?, ?)").run(leadId, body, Date.now());
      addActivity(leadId, kind + " texted to " + tw.prettyPhone(to));
    }, (e) => {
      addActivity(leadId, kind + " failed: " + e.message);
    }).then(() => broadcast(acct.id, "update", { leadId: leadId })).catch((e) => console.error("auto text", e));
  }
  function findLeadByPhone(acct, phone) {
    const key = tw.phoneKey(phone);
    if (key.length < 10) return null;
    const rows = db.prepare("SELECT * FROM leads WHERE account_id = ? AND phone != '' ORDER BY received_at DESC LIMIT 2000").all(acct.id);
    return rows.find((r) => tw.phoneKey(r.phone) === key) || null;
  }
  function accountByNumber(num) {
    const e = notify.toE164(num);
    return e ? db.prepare("SELECT * FROM accounts WHERE twilio_number = ?").get(e) : null;
  }

  // New leads with no contact after 24 hours become "Missed".
  function markMissed(acct) {
    const cutoff = Date.now() - DAY;
    const stale = db.prepare("SELECT id FROM leads WHERE account_id = ? AND status = 'new' AND received_at < ?").all(acct.id, cutoff);
    if (!stale.length) return;
    dbm.tx(db, () => stale.forEach((l) => {
      db.prepare("UPDATE leads SET status = 'missed' WHERE id = ?").run(l.id);
      addActivity(l.id, "No contact within 24 hours. Marked as missed.");
    }));
  }

  function stateFor(acct, req) {
    markMissed(acct);
    const leads = db.prepare("SELECT * FROM leads WHERE account_id = ? ORDER BY received_at DESC LIMIT 1000").all(acct.id);
    const byId = new Map();
    const out = leads.map((l) => {
      const v = { id: l.id, name: l.name, phone: l.phone, email: l.email, city: l.city, service: l.service, message: l.message,
        source: l.source, status: l.status, receivedAt: l.received_at, activity: [], messages: [] };
      byId.set(l.id, v);
      return v;
    });
    db.prepare("SELECT a.lead_id, a.text, a.note, a.at FROM activity a JOIN leads l ON l.id = a.lead_id WHERE l.account_id = ? ORDER BY a.at, a.id").all(acct.id)
      .forEach((a) => { const l = byId.get(a.lead_id); if (l) l.activity.push({ text: a.text, note: a.note || undefined, at: a.at }); });
    db.prepare("SELECT m.lead_id, m.sender, m.text, m.at FROM messages m JOIN leads l ON l.id = m.lead_id WHERE l.account_id = ? ORDER BY m.at, m.id").all(acct.id)
      .forEach((m) => { const l = byId.get(m.lead_id); if (l) l.messages.push({ from: m.sender, text: m.text, at: m.at }); });
    const lastSite = db.prepare("SELECT MAX(received_at) AS t FROM leads WHERE account_id = ? AND source = 'Website Form'").get(acct.id);
    const s = settingsOf(acct);
    return {
      leads: out,
      notifications: db.prepare("SELECT id, lead_id, text, detail, at, read FROM notifications WHERE account_id = ? ORDER BY at DESC LIMIT 50").all(acct.id)
        .map((n) => ({ id: n.id, leadId: n.lead_id, text: n.text, detail: n.detail, at: n.at, read: !!n.read })),
      team: [{ id: null, name: acct.owner, role: "Owner" }].concat(
        db.prepare("SELECT id, name, role FROM team WHERE account_id = ? ORDER BY created_at").all(acct.id).map((t) => ({ id: t.id, name: t.name, role: t.role }))),
      settings: {
        company: acct.company, owner: acct.owner, email: acct.email, phone: acct.phone, notifyPhone: acct.notify_phone,
        website: acct.website, sms: !!s.sms, email_on: !!s.email_on, sound: !!s.sound,
        autoReply: !!s.autoReply, autoReplyText: s.autoReplyText, missedTextOn: !!s.missedTextOn, missedText: s.missedText,
        twilioNumber: acct.twilio_number, forwardPhone: acct.forward_phone
      },
      voiceUrl: baseUrl(req) + "/twilio/voice",
      smsUrl: baseUrl(req) + "/twilio/sms",
      isAdmin: isAdmin(acct),
      user: { name: acct.user_name, email: acct.user_email },
      trialEnds: acct.trial_ends,
      formUrl: baseUrl(req) + "/f/" + acct.form_key,
      lastWebsiteLeadAt: lastSite && lastSite.t ? lastSite.t : null,
      smsReady: notify.smsConfigured(env),
      emailReady: notify.emailConfigured(env)
    };
  }

  // ---------- API routes ----------
  const routes = [];
  function route(method, pattern, handler, auth) {
    const keys = [];
    const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ method, rx, keys, handler, auth: auth !== false });
  }

  route("POST", "/api/signup", async (req, res, p, body) => {
    if (!authAllow("signup:" + ip(req))) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
    const company = clean(body.company, 120), name = clean(body.name, 120), email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 40), password = String(body.password || "");
    if (!company || !name) throw new HttpError(400, "Enter your company name and your name.");
    if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    if (password.length < 8) throw new HttpError(400, "Use a password with at least 8 characters.");
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new HttpError(409, "An account with this email already exists. Log in instead.");
    const now = Date.now(), acctId = sec.id(), userId = sec.id();
    dbm.tx(db, () => {
      db.prepare("INSERT INTO accounts (id, company, owner, email, phone, notify_phone, form_key, settings, trial_ends, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(acctId, company, name, email, phone, phone, sec.token(12), JSON.stringify(DEFAULT_SETTINGS), now + TRIAL_DAYS * DAY, now);
      db.prepare("INSERT INTO users (id, account_id, name, email, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(userId, acctId, name, email, sec.hashPassword(password), now);
      const attr = cleanAttr(body.attr);
      db.prepare("UPDATE accounts SET attribution = ? WHERE id = ?").run(JSON.stringify(attr), acctId);
      if (validVid(body.vid)) recordEvent(body.vid, "signup", company, "/signup", attr, "");
    });
    startSession(res, userId);
    send(res, 201, { ok: true });
  }, false);

  route("POST", "/api/login", async (req, res, p, body) => {
    if (!authAllow("login:" + ip(req))) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
    const email = clean(body.email, 200).toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !sec.verifyPassword(String(body.password || ""), user.pass_hash)) throw new HttpError(401, "Email or password is incorrect.");
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    startSession(res, user.id);
    send(res, 200, { ok: true });
  }, false);

  route("POST", "/api/logout", async (req, res) => { endSession(req, res); send(res, 200, { ok: true }); }, false);

  route("GET", "/api/state", async (req, res, p, body, acct) => send(res, 200, stateFor(acct, req)));

  route("GET", "/api/events", async (req, res, p, body, acct) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 5000\n\n");
    if (!streams.has(acct.id)) streams.set(acct.id, new Set());
    streams.get(acct.id).add(res);
    req.on("close", () => {
      const set = streams.get(acct.id);
      if (set) { set.delete(res); if (!set.size) streams.delete(acct.id); }
    });
  });

  route("PATCH", "/api/account", async (req, res, p, body, acct) => {
    const fields = { company: ["company", 120], owner: ["owner", 120], email: ["email", 200], phone: ["phone", 40], notifyPhone: ["notify_phone", 40], website: ["website", 300] };
    const sets = [], vals = [];
    Object.keys(fields).forEach((k) => {
      if (body[k] === undefined) return;
      const v = clean(body[k], fields[k][1]);
      if ((k === "company" || k === "owner") && !v) throw new HttpError(400, "Company name and your name can't be empty.");
      if (k === "email" && !validEmail(v)) throw new HttpError(400, "Enter a valid email address.");
      if (k === "website" && v && !/^https?:\/\//i.test(v)) throw new HttpError(400, "Website should start with http:// or https://");
      sets.push(fields[k][0] + " = ?"); vals.push(v);
    });
    if (body.twilioNumber !== undefined) {
      const raw = clean(body.twilioNumber, 40), num = raw ? notify.toE164(raw) : "";
      if (raw && !num) throw new HttpError(400, "Enter your Command Hub number like +18645550100.");
      if (num && db.prepare("SELECT 1 FROM accounts WHERE twilio_number = ? AND id != ?").get(num, acct.id)) throw new HttpError(409, "That number is already connected to another account.");
      sets.push("twilio_number = ?"); vals.push(num);
    }
    if (body.forwardPhone !== undefined) { sets.push("forward_phone = ?"); vals.push(clean(body.forwardPhone, 40)); }
    const s = settingsOf(acct);
    let changed = false;
    ["sms", "email_on", "sound", "autoReply", "missedTextOn"].forEach((k) => { if (typeof body[k] === "boolean") { s[k] = body[k]; changed = true; } });
    ["autoReplyText", "missedText"].forEach((k) => {
      if (body[k] === undefined) return;
      const v = cleanText(body[k], 480);
      if (!v) throw new HttpError(400, "The text message can't be empty.");
      s[k] = v; changed = true;
    });
    if (changed) { sets.push("settings = ?"); vals.push(JSON.stringify(s)); }
    if (sets.length) db.prepare("UPDATE accounts SET " + sets.join(", ") + " WHERE id = ?").run(...vals, acct.id);
    if (body.owner !== undefined) db.prepare("UPDATE users SET name = ? WHERE id = ?").run(clean(body.owner, 120), acct.user_id);
    send(res, 200, { ok: true });
  });

  route("POST", "/api/password", async (req, res, p, body, acct) => {
    if (!sec.verifyPassword(String(body.current || ""), acct.pass_hash)) throw new HttpError(400, "Your current password is incorrect.");
    if (String(body.next || "").length < 8) throw new HttpError(400, "Use a new password with at least 8 characters.");
    db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?").run(sec.hashPassword(String(body.next)), acct.user_id);
    send(res, 200, { ok: true });
  });

  route("POST", "/api/leads/test", async (req, res, p, body, acct) => {
    const s = TEST_LEADS[Math.floor(Math.random() * TEST_LEADS.length)];
    const lead = createLead(acct, { name: s[0], phone: s[1], service: s[2], city: s[3], message: s[4], email: s[0].toLowerCase().replace(/\s+/g, "") + "@example.com" }, "Test Lead", req);
    send(res, 201, { id: lead.id });
  });

  route("POST", "/api/leads/bulk", async (req, res, p, body, acct) => {
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500).map(String) : [];
    let n = 0;
    dbm.tx(db, () => ids.forEach((id) => {
      const l = db.prepare("SELECT * FROM leads WHERE id = ? AND account_id = ?").get(id, acct.id);
      if (!l) return;
      if (body.action === "delete") db.prepare("DELETE FROM leads WHERE id = ?").run(id);
      else if (body.action === "contacted") setStatus(l, "contacted");
      else throw new HttpError(400, "Unknown action.");
      n++;
    }));
    send(res, 200, { ok: true, count: n });
  });

  route("PATCH", "/api/leads/:id", async (req, res, p, body, acct) => {
    const l = ownedLead(acct, p.id);
    if (!STATUSES.includes(body.status)) throw new HttpError(400, "Unknown status.");
    setStatus(l, body.status);
    send(res, 200, { ok: true });
  });

  route("DELETE", "/api/leads/:id", async (req, res, p, body, acct) => {
    ownedLead(acct, p.id);
    db.prepare("DELETE FROM leads WHERE id = ?").run(p.id);
    send(res, 200, { ok: true });
  });

  route("POST", "/api/leads/:id/contact", async (req, res, p, body, acct) => {
    const l = ownedLead(acct, p.id);
    const how = body.how === "text" ? "text" : "call";
    dbm.tx(db, () => {
      addActivity(l.id, (how === "text" ? "Texted " : "Called ") + l.phone);
      const msg = cleanText(body.message, 1600);
      if (how === "text" && msg) db.prepare("INSERT INTO messages (lead_id, sender, text, at) VALUES (?, 'you', ?, ?)").run(l.id, msg, Date.now());
      if (l.status === "new" || l.status === "missed") setStatus(l, "contacted");
    });
    send(res, 200, { ok: true });
  });

  route("POST", "/api/leads/:id/notes", async (req, res, p, body, acct) => {
    const l = ownedLead(acct, p.id);
    const note = cleanText(body.note, 2000);
    if (!note) throw new HttpError(400, "Write a note first.");
    addActivity(l.id, "Note added", note);
    send(res, 201, { ok: true });
  });

  route("POST", "/api/notifications/read", async (req, res, p, body, acct) => {
    if (body.all) db.prepare("UPDATE notifications SET read = 1 WHERE account_id = ?").run(acct.id);
    else if (body.leadId) db.prepare("UPDATE notifications SET read = 1 WHERE account_id = ? AND lead_id = ?").run(acct.id, String(body.leadId));
    else if (body.id) db.prepare("UPDATE notifications SET read = 1 WHERE account_id = ? AND id = ?").run(acct.id, String(body.id));
    send(res, 200, { ok: true });
  });

  route("POST", "/api/team", async (req, res, p, body, acct) => {
    const name = clean(body.name, 120);
    if (!name) throw new HttpError(400, "Enter the team member's name.");
    db.prepare("INSERT INTO team (id, account_id, name, role, created_at) VALUES (?, ?, ?, ?, ?)").run(sec.id(), acct.id, name, clean(body.role, 80) || "Team Member", Date.now());
    send(res, 201, { ok: true });
  });

  route("DELETE", "/api/team/:id", async (req, res, p, body, acct) => {
    db.prepare("DELETE FROM team WHERE id = ? AND account_id = ?").run(p.id, acct.id);
    send(res, 200, { ok: true });
  });

  route("POST", "/api/leads/:id/sms", async (req, res, p, body, acct) => {
    const l = ownedLead(acct, p.id);
    if (!notify.smsConfigured(env)) throw new HttpError(400, "Texting isn't set up on the server yet.");
    if (!l.phone) throw new HttpError(400, "This lead didn't leave a phone number.");
    const msg = cleanText(body.message, 1600);
    if (!msg) throw new HttpError(400, "Write a message first.");
    try { await notify.sendSms(env, l.phone, msg, acct.twilio_number || undefined); }
    catch (e) { throw new HttpError(502, "Text not sent: " + e.message); }
    dbm.tx(db, () => {
      db.prepare("INSERT INTO messages (lead_id, sender, text, at) VALUES (?, 'you', ?, ?)").run(l.id, msg, Date.now());
      addActivity(l.id, "Texted " + l.phone);
      if (l.status === "new" || l.status === "missed") setStatus(l, "contacted");
    });
    send(res, 200, { ok: true });
  });

  // ---------- Analytics ----------
  function isAdmin(acct) { return !!acct && admins.includes(String(acct.user_email || "").toLowerCase()); }
  function validVid(v) { return typeof v === "string" && /^[\w-]{8,64}$/.test(v); }
  function cleanAttr(a) {
    const out = {};
    if (!a || typeof a !== "object") return out;
    ["c", "r", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing"].forEach((k) => { if (a[k]) out[k] = clean(a[k], 100); });
    return out;
  }
  function recordEvent(vid, type, label, pagePath, attr, ref) {
    attr = attr || {};
    db.prepare("INSERT INTO events (at, vid, type, label, path, campaign, recipient, source, medium, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(Date.now(), vid, type, clean(label, 80), clean(pagePath, 200), clean(attr.c || attr.utm_campaign, 100), clean(attr.r, 100),
        clean(attr.utm_source, 100), clean(attr.utm_medium, 100), clean(String(ref || "").split("?")[0], 300));
  }
  function recipientRows(since) {
    return db.prepare(
      "SELECT recipient, MAX(campaign) AS campaign, MIN(at) AS first_seen, MAX(at) AS last_seen, COUNT(*) AS events, " +
      "MAX(CASE type WHEN 'signup' THEN 5 WHEN 'signup_start' THEN 4 WHEN 'demo' THEN 3 WHEN 'cta' THEN 3 WHEN 'pricing_view' THEN 2 ELSE 1 END) AS stage " +
      "FROM events WHERE recipient != '' AND at >= ? GROUP BY recipient ORDER BY last_seen DESC LIMIT 5000"
    ).all(since).map((r) => Object.assign(r, { stageLabel: STAGES[r.stage] }));
  }
  function sinceParam(req) {
    const days = Math.min(365, Math.max(1, Number(new URL(req.url, "http://x").searchParams.get("days")) || 30));
    return { days, since: Date.now() - days * DAY };
  }

  route("GET", "/api/admin/stats", async (req, res, p, body, acct) => {
    if (!isAdmin(acct)) throw new HttpError(404, "Not found.");
    const { days, since } = sinceParam(req);
    const campaigns = db.prepare(
      "SELECT CASE WHEN campaign = '' THEN '(no campaign)' ELSE campaign END AS campaign, COUNT(DISTINCT vid) AS visitors, " +
      "COUNT(DISTINCT CASE WHEN type = 'pricing_view' THEN vid END) AS pricing, " +
      "COUNT(DISTINCT CASE WHEN type IN ('demo', 'cta') THEN vid END) AS interested, " +
      "COUNT(DISTINCT CASE WHEN type = 'signup_start' THEN vid END) AS signupStarts, " +
      "COUNT(DISTINCT CASE WHEN type = 'signup' THEN vid END) AS signups " +
      "FROM events WHERE at >= ? GROUP BY 1 ORDER BY visitors DESC"
    ).all(since);
    const daily = db.prepare(
      "SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, COUNT(DISTINCT vid) AS visitors, " +
      "COUNT(DISTINCT CASE WHEN type = 'signup' THEN vid END) AS signups FROM events WHERE at >= ? GROUP BY 1 ORDER BY 1"
    ).all(since);
    const signups = db.prepare("SELECT company, email, created_at, attribution FROM accounts WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200").all(since)
      .map((a) => { let at = {}; try { at = JSON.parse(a.attribution || "{}"); } catch (e) { /* ignore */ } return { company: a.company, email: a.email, at: a.created_at, campaign: at.c || at.utm_campaign || "", recipient: at.r || "" }; });
    send(res, 200, { days, campaigns, daily, recipients: recipientRows(since).slice(0, 300), signups });
  });

  route("GET", "/api/admin/recipients.csv", async (req, res, p, body, acct) => {
    if (!isAdmin(acct)) throw new HttpError(404, "Not found.");
    const { since } = sinceParam(req);
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const iso = (t) => new Date(t).toISOString();
    const lines = ["recipient,campaign,stage,stage_name,first_seen,last_seen,events"].concat(recipientRows(since).map((r) =>
      [q(r.recipient), q(r.campaign), r.stage, q(r.stageLabel), iso(r.first_seen), iso(r.last_seen), r.events].join(",")));
    send(res, 200, lines.join("\n") + "\n", { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="recipients.csv"' });
  });

  async function handleTrack(req, res) {
    if (req.method !== "POST") { send(res, 405, "Use POST."); return; }
    if (trackAllow(ip(req))) {
      let d = {};
      try { d = JSON.parse(await readRaw(req, 8 * 1024)); } catch (e) { d = {}; }
      // Sign-ups are recorded by the server itself, so the browser can't fake them.
      if (d && EVENT_TYPES.includes(d.type) && d.type !== "signup" && validVid(d.vid)) recordEvent(d.vid, d.type, d.label, d.path, cleanAttr(d.attr), d.ref);
    }
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  }

  function configJs(res) {
    const cfg = { metaPixel: clean(env.META_PIXEL_ID, 40), googleTag: clean(env.GOOGLE_TAG_ID, 40), googleSignupConversion: clean(env.GOOGLE_ADS_SIGNUP_CONVERSION, 80) };
    send(res, 200, "window.CH_CONFIG = " + JSON.stringify(cfg).replace(/</g, "\\u003c") + ";\n", { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" });
  }

  // ---------- Twilio webhooks: calls and texts to a roofer's Command Hub number ----------
  async function handleTwilio(req, res, kind) {
    const reply = (inner) => { res.writeHead(200, { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" }); res.end(tw.twiml(inner)); };
    if (req.method !== "POST") { send(res, 405, "Use POST."); return; }
    const params = await readBody(req, 64 * 1024);
    if (!tw.validSignature(env.TWILIO_AUTH_TOKEN, baseUrl(req) + req.url, params, req.headers["x-twilio-signature"])) { send(res, 403, "Invalid signature."); return; }
    const acct = accountByNumber(params.To);
    if (!acct) { reply(kind === "sms" ? "" : "<Say>Sorry, this number is not in service.</Say>"); return; }
    const s = settingsOf(acct), from = params.From || "";
    const sorry = s.missedTextOn ? "<Say>Sorry we missed your call. We'll text you right back.</Say><Hangup/>" : "<Say>Sorry we missed your call. Please try again soon.</Say><Hangup/>";

    if (kind === "voice") {
      const fwd = notify.toE164(acct.forward_phone || acct.notify_phone || acct.phone);
      if (!fwd) { missedCall(acct, from, req); reply(sorry); return; }
      const callerId = notify.toE164(from) || acct.twilio_number;
      reply('<Dial timeout="20" answerOnBridge="true" callerId="' + tw.xml(callerId) + '" action="' + tw.xml(baseUrl(req) + "/twilio/voice/done") + '" method="POST"><Number>' + tw.xml(fwd) + "</Number></Dial>");
      return;
    }
    if (kind === "voice-done") {
      if (params.DialCallStatus === "completed") {
        const l = findLeadByPhone(acct, from);
        if (l) { addActivity(l.id, "Answered a call from " + tw.prettyPhone(from)); broadcast(acct.id, "update", { leadId: l.id }); }
        reply("");
      } else {
        missedCall(acct, from, req);
        reply(sorry);
      }
      return;
    }
    // Inbound text
    const text = cleanText(params.Body, 1600);
    let l = findLeadByPhone(acct, from);
    if (!l) {
      createLead(acct, { name: "Text from " + tw.prettyPhone(from), phone: tw.prettyPhone(from), service: "Text message", message: text }, "Text Message", req, { noAutoReply: true });
    } else {
      const now = Date.now();
      dbm.tx(db, () => {
        db.prepare("INSERT INTO messages (lead_id, sender, text, at) VALUES (?, 'them', ?, ?)").run(l.id, text, now);
        addActivity(l.id, "Texted you");
        db.prepare("INSERT INTO notifications (id, account_id, lead_id, text, detail, at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(sec.id(), acct.id, l.id, "New text message", l.name + ": " + text.slice(0, 80), now);
      });
      broadcast(acct.id, "message", { id: l.id, name: l.name, text: text.slice(0, 140) });
      if (s.sms && notify.smsConfigured(env) && acct.notify_phone) {
        notify.sendSms(env, acct.notify_phone, "Text from " + l.name + ": " + text.slice(0, 300) + "\n" + baseUrl(req) + "/app/#lead-" + l.id, acct.twilio_number || undefined)
          .catch((e) => console.error("forward text", e.message));
      }
    }
    reply("");
  }

  function missedCall(acct, from, req) {
    const caller = tw.prettyPhone(from), now = Date.now();
    let l = findLeadByPhone(acct, from);
    if (l) {
      addActivity(l.id, "Missed call from " + caller);
      db.prepare("INSERT INTO notifications (id, account_id, lead_id, text, detail, at) VALUES (?, ?, ?, ?, ?, ?)").run(sec.id(), acct.id, l.id, "Missed call", l.name + " • " + caller, now);
      broadcast(acct.id, "lead", { id: l.id, name: l.name, phone: l.phone, service: "Missed call", receivedAt: now });
    } else {
      l = createLead(acct, { name: "Caller " + caller, phone: caller, service: "Missed call" }, "Missed Call", req, { noAutoReply: true });
    }
    const s = settingsOf(acct);
    if (s.missedTextOn && notify.toE164(from)) {
      if (notify.smsConfigured(env)) autoText(acct, l.id, from, fill(s.missedText, acct, null), "Missed-call text");
      else addActivity(l.id, "Missed-call text skipped: texting is not set up on the server yet");
    }
  }

  // ---------- Public lead form endpoint ----------
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

  function thanksPage(back) {
    const link = back ? '<p><a href="' + back.replace(/"/g, "&quot;") + '">Back to the website</a></p>' : "";
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Thank you</title>' +
      '<style>body{font-family:system-ui,sans-serif;background:#f4f7fc;color:#0b1430;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}' +
      'main{background:#fff;border:1px solid #e5eaf3;border-radius:14px;padding:32px;max-width:420px;text-align:center}a{color:#1463ff}</style></head>' +
      "<body><main><h1>Thank you!</h1><p>We got your request and will be in touch shortly.</p>" + link + "</main></body></html>";
  }

  async function handleForm(req, res, key) {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    if (req.method !== "POST") { send(res, 405, "Use POST to submit a lead.", CORS); return; }
    const wantsJson = /application\/json/.test(req.headers.accept || "") || /application\/json/.test(req.headers["content-type"] || "");
    const acct = db.prepare("SELECT * FROM accounts WHERE form_key = ?").get(key);
    try {
      if (!acct) throw new HttpError(404, "This form address isn't connected to a Command Hub account.");
      if (!formAllow("form:" + key + ":" + ip(req))) throw new HttpError(429, "Too many submissions. Please try again in a few minutes.");
      const body = await readBody(req, 64 * 1024);
      if (body._gotcha) { // spam bots fill hidden fields; pretend success
        if (wantsJson) send(res, 200, { ok: true }, CORS); else send(res, 200, thanksPage(), Object.assign({ "Content-Type": "text/html; charset=utf-8" }, CORS));
        return;
      }
      createLead(acct, body, "Website Form", req);
      const back = typeof body._redirect === "string" && /^https?:\/\//i.test(body._redirect) ? body._redirect : null;
      if (wantsJson) send(res, 201, { ok: true }, CORS);
      else if (back) { res.writeHead(303, Object.assign({ Location: back }, CORS)); res.end(); }
      else {
        const ref = /^https?:\/\//i.test(req.headers.referer || "") ? req.headers.referer : null;
        send(res, 200, thanksPage(ref), Object.assign({ "Content-Type": "text/html; charset=utf-8" }, CORS));
      }
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      const msg = status === 500 ? "Something went wrong. Please try again." : e.message;
      if (wantsJson) send(res, status, { error: msg }, CORS);
      else send(res, status, msg, CORS);
    }
  }

  // ---------- Static files ----------
  function serveFile(res, file, status, req) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".mp4" || ext === ".webm") { serveMedia(req, res, file, ext); return; }
    fs.readFile(file, (err, data) => {
      if (err) { send(res, 404, "Page not found."); return; }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(status || 200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300"
      });
      res.end(data);
    });
  }

  // Video needs byte ranges: Safari won't play it otherwise, and seeking uses them too.
  function serveMedia(req, res, file, ext) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { send(res, 404, "Page not found."); return; }
      const headers = { "Content-Type": MIME[ext], "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };
      const m = /^bytes=(\d*)-(\d*)$/.exec((req && req.headers.range) || "");
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(200, Object.assign(headers, { "Content-Length": st.size }));
        if (req && req.method === "HEAD") { res.end(); return; }
        fs.createReadStream(file).pipe(res);
        return;
      }
      let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      let end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) {
        res.writeHead(416, { "Content-Range": "bytes */" + st.size });
        res.end();
        return;
      }
      res.writeHead(206, Object.assign(headers, { "Content-Range": "bytes " + start + "-" + end + "/" + st.size, "Content-Length": end - start + 1 }));
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(file, { start: start, end: end }).pipe(res);
    });
  }

  // ---------- Request handler ----------
  async function handle(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { send(res, 400, "Bad request."); return; }

    try {
      if (pathname === "/healthz") { send(res, 200, "ok"); return; }

      if (pathname === "/t") { await handleTrack(req, res); return; }
      if (pathname === "/config.js") { configJs(res); return; }
      if (pathname === "/twilio/voice") { await handleTwilio(req, res, "voice"); return; }
      if (pathname === "/twilio/voice/done") { await handleTwilio(req, res, "voice-done"); return; }
      if (pathname === "/twilio/sms") { await handleTwilio(req, res, "sms"); return; }

      const formMatch = pathname.match(/^\/f\/([\w-]+)$/);
      if (formMatch) { await handleForm(req, res, formMatch[1]); return; }

      if (pathname.startsWith("/api/")) {
        const r = routes.find((x) => x.method === req.method && x.rx.test(pathname));
        if (!r) throw new HttpError(404, "Not found.");
        const m = pathname.match(r.rx), params = {};
        r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        let body = {};
        if (req.method !== "GET" && req.method !== "DELETE") {
          // Requiring JSON blocks cross-site form posts against the API.
          if (!/^application\/json/i.test(req.headers["content-type"] || "")) throw new HttpError(415, "Send JSON.");
          body = await readBody(req, 64 * 1024);
        }
        const acct = current(req);
        if (r.auth && !acct) throw new HttpError(401, "Please log in.");
        await r.handler(req, res, params, body, acct);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, "Method not allowed."); return; }
      res.setHeader("X-Frame-Options", "DENY");

      if (pathname === "/login" || pathname === "/signup") {
        if (current(req)) { redirect(res, "/app/"); return; }
        serveFile(res, path.join(publicDir, "auth.html"));
        return;
      }
      if (pathname === "/privacy") { serveFile(res, path.join(publicDir, "privacy.html")); return; }
      if (pathname === "/app") { redirect(res, "/app/"); return; }
      if (pathname === "/admin") {
        const who = current(req);
        if (!who) { redirect(res, "/login"); return; }
        if (!isAdmin(who)) { serveFile(res, path.join(publicDir, "404.html"), 404); return; }
        serveFile(res, path.join(publicDir, "admin.html"));
        return;
      }
      if (pathname === "/admin.html") { send(res, 404, "Page not found."); return; }
      if (pathname === "/app/" || pathname === "/app/index.html") {
        if (!current(req)) { redirect(res, "/login"); return; }
        serveFile(res, path.join(publicDir, "app", "index.html"));
        return;
      }
      const file = path.normalize(path.join(publicDir, pathname.endsWith("/") ? pathname + "index.html" : pathname));
      if (!file.startsWith(publicDir + path.sep)) { send(res, 404, "Page not found."); return; }
      fs.stat(file, (err, st) => {
        if (!err && st.isFile()) serveFile(res, file, 200, req);
        else serveFile(res, path.join(publicDir, "404.html"), 404);
      });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: status === 500 ? "Something went wrong on our end. Please try again." : e.message });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.db = db;
  server.on("close", () => { clearInterval(heartbeat); for (const set of streams.values()) for (const r of set) r.end(); });
  return server;
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log("Command Hub running at http://localhost:" + port);
    if (!notify.smsConfigured(process.env)) console.log("Text alerts are off: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM to turn them on.");
    if (!notify.emailConfigured(process.env)) console.log("Email alerts are off: set RESEND_API_KEY and EMAIL_FROM to turn them on.");
  });
}
