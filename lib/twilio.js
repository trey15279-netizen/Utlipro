"use strict";
// Helpers for Twilio webhooks: request signature checks and TwiML (call/SMS instructions).
const crypto = require("crypto");

// https://www.twilio.com/docs/usage/security#validating-requests
function signature(authToken, url, params) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

function validSignature(authToken, url, params, header) {
  if (!authToken || !header) return false;
  const expected = Buffer.from(signature(authToken, url, params));
  const given = Buffer.from(String(header));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function xml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function twiml(inner) { return '<?xml version="1.0" encoding="UTF-8"?><Response>' + (inner || "") + "</Response>"; }

// Last 10 digits, for matching "(864) 555-0100" against "+18645550100".
function phoneKey(p) { return String(p || "").replace(/\D/g, "").slice(-10); }

function prettyPhone(p) {
  const k = phoneKey(p);
  return k.length === 10 ? "(" + k.slice(0, 3) + ") " + k.slice(3, 6) + "-" + k.slice(6) : String(p || "");
}

module.exports = { signature, validSignature, xml, twiml, phoneKey, prettyPhone };
