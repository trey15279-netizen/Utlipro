"use strict";
const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, SCRYPT);
  return "scrypt$" + salt.toString("base64") + "$" + key.toString("base64");
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  const key = crypto.scryptSync(password, salt, expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

function token(bytes) { return crypto.randomBytes(bytes || 32).toString("base64url"); }
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function id() { return crypto.randomBytes(9).toString("base64url"); }

// Fixed-window rate limiter kept in memory: allow `max` hits per `windowMs` for each key.
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return function allow(key) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    return h.n <= max;
  };
}

module.exports = { hashPassword, verifyPassword, token, sha256, id, limiter };
