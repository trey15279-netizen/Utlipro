"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../server");
const tw = require("../lib/twilio");

const TOKEN = "test-auth-token";
const ENV = { TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: "+18645550000", ADMIN_EMAILS: "owner@commandhub.test" };

// Capture texts sent to Twilio instead of sending them.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.twilio.com/")) {
    const p = new URLSearchParams(String(opts.body));
    sent.push({ to: p.get("To"), from: p.get("From"), body: p.get("Body") });
    return new Response(JSON.stringify({ sid: "SM1" }), { status: 201, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, opts);
};

async function start() {
  const server = createApp({ dbPath: ":memory:", env: Object.assign({}, ENV) });
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  return { server, base };
}

function client(base) {
  let cookie = "";
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method, redirect: "manual",
      headers: Object.assign({ Cookie: cookie }, body !== undefined ? { "Content-Type": "application/json" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    return { status: res.status, body: type.includes("json") ? await res.json() : await res.text() };
  };
}

// Post to a Twilio webhook the way Twilio does, with a valid signature.
function twilioPost(base, path, params, token) {
  const url = base + path;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": tw.signature(token || TOKEN, url, params) },
    body: new URLSearchParams(params)
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function signup(call, extra) {
  return call("POST", "/api/signup", Object.assign({ company: "Roofer Pro", name: "John Carter", email: "john@rooferpro.com", phone: "(864) 555-0123", password: "correct horse" }, extra || {}));
}

test("website lead gets an instant auto-reply text", async () => {
  sent.length = 0;
  const { server, base } = await start();
  const call = client(base);
  try {
    await signup(call);
    const formPath = new URL((await call("GET", "/api/state")).body.formUrl).pathname;
    const r = await fetch(base + formPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Jane Doe", phone: "(864) 555-0100", service: "Roof Repair" }) });
    assert.strictEqual(r.status, 201);
    await wait(100);
    const reply = sent.find((m) => m.to === "+18645550100");
    assert.ok(reply, "auto-reply sent to the homeowner");
    assert.match(reply.body, /^Hi Jane, thanks for contacting Roofer Pro! This is John\./);
    assert.match(reply.body, /Reply STOP to opt out\.$/);
    assert.ok(sent.some((m) => m.to === "+18645550123" && /New lead: Jane Doe/.test(m.body)), "alert sent to the roofer");

    const lead = (await call("GET", "/api/state")).body.leads[0];
    assert.strictEqual(lead.messages[0].from, "auto");
    assert.ok(lead.activity.some((a) => a.text === "Auto-reply texted to (864) 555-0100"));

    // Turn auto-reply off: no text for the next lead
    await call("PATCH", "/api/account", { autoReply: false });
    sent.length = 0;
    await fetch(base + formPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Sam Roe", phone: "(864) 555-0199" }) });
    await wait(100);
    assert.ok(!sent.some((m) => m.to === "+18645550199"));
  } finally { server.close(); }
});

test("missed call creates a lead and texts the caller back; answered calls don't", async () => {
  sent.length = 0;
  const { server, base } = await start();
  const call = client(base);
  try {
    await signup(call);
    assert.strictEqual((await call("PATCH", "/api/account", { twilioNumber: "not a number" })).status, 400);
    assert.strictEqual((await call("PATCH", "/api/account", { twilioNumber: "(864) 555-0999", forwardPhone: "(864) 555-0777" })).status, 200);
    const st = (await call("GET", "/api/state")).body;
    assert.strictEqual(st.settings.twilioNumber, "+18645550999");

    // Bad signature is rejected
    const forged = await twilioPost(base, "/twilio/voice", { To: "+18645550999", From: "+18645551234" }, "wrong-token");
    assert.strictEqual(forged.status, 403);

    const voice = await twilioPost(base, "/twilio/voice", { To: "+18645550999", From: "+18645551234" });
    const xml = await voice.text();
    assert.match(xml, /<Dial[^>]*action="[^"]*\/twilio\/voice\/done"/);
    assert.match(xml, /<Number>\+18645550777<\/Number>/);

    // Answered: nothing happens
    await twilioPost(base, "/twilio/voice/done", { To: "+18645550999", From: "+18645551234", DialCallStatus: "completed" });
    assert.strictEqual((await call("GET", "/api/state")).body.leads.length, 0);

    // Not answered: lead + text-back from the Command Hub number
    const done = await twilioPost(base, "/twilio/voice/done", { To: "+18645550999", From: "+18645551234", DialCallStatus: "no-answer" });
    assert.match(await done.text(), /text you right back/);
    await wait(100);
    const leads = (await call("GET", "/api/state")).body.leads;
    assert.strictEqual(leads.length, 1);
    assert.strictEqual(leads[0].source, "Missed Call");
    assert.strictEqual(leads[0].phone, "(864) 555-1234");
    const back = sent.find((m) => m.to === "+18645551234");
    assert.ok(back, "missed-call text sent");
    assert.strictEqual(back.from, "+18645550999");
    assert.match(back.body, /Sorry I missed your call/);
  } finally { server.close(); }
});

test("texts to the number land in the lead's conversation, and the roofer can reply", async () => {
  sent.length = 0;
  const { server, base } = await start();
  const call = client(base);
  try {
    await signup(call);
    await call("PATCH", "/api/account", { twilioNumber: "+18645550999" });

    // New number texting in becomes a lead
    await twilioPost(base, "/twilio/sms", { To: "+18645550999", From: "+18645552222", Body: "Do you do metal roofs?" });
    let leads = (await call("GET", "/api/state")).body.leads;
    assert.strictEqual(leads.length, 1);
    assert.strictEqual(leads[0].source, "Text Message");
    assert.strictEqual(leads[0].message, "Do you do metal roofs?");

    // Roofer replies from the app
    sent.length = 0;
    const r = await call("POST", "/api/leads/" + leads[0].id + "/sms", { message: "Yes we do! When can I come by?" });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(sent[0], { to: "+18645552222", from: "+18645550999", body: "Yes we do! When can I come by?" });

    // Their answer is added to the same conversation
    await twilioPost(base, "/twilio/sms", { To: "+18645550999", From: "+18645552222", Body: "Tomorrow at 10 works" });
    leads = (await call("GET", "/api/state")).body.leads;
    assert.strictEqual(leads.length, 1);
    assert.deepStrictEqual(leads[0].messages.map((m) => m.from + ":" + m.text), ["you:Yes we do! When can I come by?", "them:Tomorrow at 10 works"]);
    assert.strictEqual(leads[0].status, "contacted");
  } finally { server.close(); }
});

test("site visits are tracked by campaign and person, and only admins see stats", async () => {
  const { server, base } = await start();
  try {
    const beacon = (body) => fetch(base + "/t", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
    const attr = { c: "roofers-v2", r: "lead-42" };
    assert.strictEqual((await beacon({ vid: "visitor-0001", type: "pageview", path: "/", attr })).status, 204);
    await beacon({ vid: "visitor-0001", type: "pricing_view", path: "/", attr });
    await beacon({ vid: "visitor-0001", type: "signup", path: "/", attr }); // browsers can't record sign-ups
    await beacon({ vid: "visitor-0002", type: "pageview", path: "/", attr: { c: "roofers-v1", r: "lead-7" } });
    await beacon({ vid: "bad", type: "pageview" });
    await beacon({ vid: "visitor-0003", type: "hack" });

    // The real sign-up carries the visitor's attribution
    const owner = client(base);
    await signup(owner, { email: "owner@commandhub.test", company: "Acme Roofing", vid: "visitor-0001", attr });

    const stats = (await owner("GET", "/api/admin/stats?days=7")).body;
    const v2 = stats.campaigns.find((c) => c.campaign === "roofers-v2");
    assert.deepStrictEqual([v2.visitors, v2.pricing, v2.signups], [1, 1, 1]);
    assert.strictEqual(stats.campaigns.find((c) => c.campaign === "roofers-v1").signups, 0);
    const person = stats.recipients.find((r) => r.recipient === "lead-42");
    assert.strictEqual(person.stageLabel, "Signed up");
    assert.strictEqual(stats.signups[0].recipient, "lead-42");

    const csv = await owner("GET", "/api/admin/recipients.csv");
    assert.match(csv.body, /^recipient,campaign,stage/);
    assert.match(csv.body, /"lead-7","roofers-v1",1,"Visited"/);
    assert.strictEqual((await owner("GET", "/admin")).status, 200);

    const other = client(base);
    await signup(other, { email: "someone@else.com" });
    assert.strictEqual((await other("GET", "/api/admin/stats")).status, 404);
    assert.strictEqual((await other("GET", "/admin")).status, 404);
    assert.strictEqual((await other("GET", "/admin.html")).status, 404);

    const cfg = await (await fetch(base + "/config.js")).text();
    assert.match(cfg, /^window\.CH_CONFIG = \{/);
    assert.strictEqual((await fetch(base + "/privacy")).status, 200);
  } finally { server.close(); }
});
