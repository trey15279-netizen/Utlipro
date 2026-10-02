"use strict";
// Sends new-lead alerts by text (Twilio) and email (Resend). Each channel is skipped
// when its environment variables are missing, so the app runs fine without them.

function toE164(phone) {
  const d = String(phone || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.length >= 11 ? d : null;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return null;
}

function smsConfigured(env) { return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM); }
function emailConfigured(env) { return !!(env.RESEND_API_KEY && env.EMAIL_FROM); }

async function sendSms(env, to, body) {
  const num = toE164(to);
  if (!num) throw new Error("Notification phone number is not a valid US number");
  const url = "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(env.TWILIO_ACCOUNT_SID) + "/Messages.json";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(env.TWILIO_ACCOUNT_SID + ":" + env.TWILIO_AUTH_TOKEN).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: num, From: env.TWILIO_FROM, Body: body })
  });
  if (!res.ok) {
    let msg = "Twilio error " + res.status;
    try { const j = await res.json(); if (j.message) msg += ": " + j.message; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
}

async function sendEmail(env, to, subject, text, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, html })
  });
  if (!res.ok) {
    let msg = "Resend error " + res.status;
    try { const j = await res.json(); if (j.message) msg += ": " + j.message; } catch (e) { /* ignore */ }
    throw new Error(msg);
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Returns a list of { ok, text } results describing what happened, for the lead's activity log.
async function alertNewLead(env, account, lead, settings, appUrl) {
  const out = [];
  const link = appUrl + "/app/#lead-" + lead.id;
  const lines = [lead.name, lead.service, lead.phone, lead.email, lead.city].filter(Boolean);

  if (settings.sms) {
    if (!smsConfigured(env)) out.push({ ok: false, text: "Text alert skipped: texting is not set up on the server yet" });
    else if (!account.notify_phone) out.push({ ok: false, text: "Text alert skipped: no notification phone number in Settings" });
    else {
      try {
        await sendSms(env, account.notify_phone, "New lead: " + lines.join(" • ") + "\n" + link);
        out.push({ ok: true, text: "Text alert sent to " + account.notify_phone });
      } catch (e) { out.push({ ok: false, text: "Text alert failed: " + e.message }); }
    }
  }

  if (settings.email_on) {
    if (!emailConfigured(env)) out.push({ ok: false, text: "Email alert skipped: email is not set up on the server yet" });
    else {
      const rows = [["Name", lead.name], ["Phone", lead.phone], ["Email", lead.email], ["Service", lead.service], ["City", lead.city], ["Message", lead.message]]
        .filter((r) => r[1]).map((r) => "<tr><td style=\"padding:4px 12px 4px 0;color:#6c7893\">" + r[0] + "</td><td style=\"padding:4px 0\">" + esc(r[1]) + "</td></tr>").join("");
      const html = "<div style=\"font-family:Arial,sans-serif;font-size:15px;color:#0b1430\"><h2 style=\"margin:0 0 12px\">New lead received</h2><table>" + rows +
        "</table><p><a href=\"" + esc(link) + "\" style=\"display:inline-block;background:#1463ff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none\">Open in Command Hub</a></p></div>";
      const text = "New lead received\n\n" + lines.join("\n") + (lead.message ? "\n\n" + lead.message : "") + "\n\n" + link;
      try {
        await sendEmail(env, account.email, "New lead: " + lead.name + (lead.service ? " • " + lead.service : ""), text, html);
        out.push({ ok: true, text: "Email alert sent to " + account.email });
      } catch (e) { out.push({ ok: false, text: "Email alert failed: " + e.message }); }
    }
  }
  return out;
}

module.exports = { alertNewLead, smsConfigured, emailConfigured, toE164 };
