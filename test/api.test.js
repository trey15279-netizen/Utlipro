"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../server");

function start(env) {
  const server = createApp({ dbPath: ":memory:", env: env || {} });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, base: "http://127.0.0.1:" + server.address().port })));
}

function client(base) {
  let cookie = "";
  return async function call(method, url, body, headers) {
    const res = await fetch(base + url, {
      method,
      redirect: "manual",
      headers: Object.assign({ Cookie: cookie }, body !== undefined ? { "Content-Type": "application/json" } : {}, headers || {}),
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const type = res.headers.get("content-type") || "";
    return { status: res.status, headers: res.headers, body: type.includes("json") ? await res.json() : await res.text() };
  };
}

const SIGNUP = { company: "Roofer Pro", name: "John Carter", email: "john@rooferpro.com", phone: "(864) 555-0123", password: "correct horse" };

test("sign up, receive a website lead, work it, and log out", async () => {
  const { server, base } = await start();
  const call = client(base);
  try {
    assert.strictEqual((await call("GET", "/api/state")).status, 401);
    assert.strictEqual((await call("GET", "/app/")).status, 302);

    const su = await call("POST", "/api/signup", SIGNUP);
    assert.strictEqual(su.status, 201);
    assert.strictEqual((await call("GET", "/app/")).status, 200);

    let st = (await call("GET", "/api/state")).body;
    assert.strictEqual(st.leads.length, 0);
    assert.strictEqual(st.settings.company, "Roofer Pro");
    assert.match(st.formUrl, /\/f\/[\w-]+$/);
    const formPath = new URL(st.formUrl).pathname;

    // A plain HTML form post from the roofer's website
    const form = await fetch(base + formPath, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://rooferpro.com/contact" },
      body: new URLSearchParams({ name: "Jane Doe", phone: "(864) 555-0100", service: "Roof Repair", message: "Leak over the porch" })
    });
    assert.strictEqual(form.status, 200);
    assert.match(await form.text(), /Thank you/);
    assert.strictEqual(form.headers.get("access-control-allow-origin"), "*");

    st = (await call("GET", "/api/state")).body;
    assert.strictEqual(st.leads.length, 1);
    const lead = st.leads[0];
    assert.strictEqual(lead.name, "Jane Doe");
    assert.strictEqual(lead.status, "new");
    assert.strictEqual(lead.source, "Website Form");
    assert.ok(st.lastWebsiteLeadAt);
    assert.strictEqual(st.notifications.filter((n) => !n.read).length, 1);

    // Call the lead: becomes contacted
    assert.strictEqual((await call("POST", "/api/leads/" + lead.id + "/contact", { how: "call" })).status, 200);
    // Text with a message: saved to the thread
    await call("POST", "/api/leads/" + lead.id + "/contact", { how: "text", message: "On my way" });
    await call("POST", "/api/leads/" + lead.id + "/notes", { note: "Gate code 1234" });
    await call("PATCH", "/api/leads/" + lead.id, { status: "appointment" });
    st = (await call("GET", "/api/state")).body;
    const l2 = st.leads[0];
    assert.strictEqual(l2.status, "appointment");
    assert.deepStrictEqual(l2.messages.map((m) => m.text), ["On my way"]);
    assert.ok(l2.activity.some((a) => a.note === "Gate code 1234"));
    assert.ok(l2.activity.some((a) => a.text === "Status changed to Contacted"));

    assert.strictEqual((await call("PATCH", "/api/leads/" + lead.id, { status: "bogus" })).status, 400);

    await call("POST", "/api/notifications/read", { all: true });
    st = (await call("GET", "/api/state")).body;
    assert.strictEqual(st.notifications.filter((n) => !n.read).length, 0);

    await call("POST", "/api/logout", {});
    assert.strictEqual((await call("GET", "/api/state")).status, 401);

    const bad = await call("POST", "/api/login", { email: SIGNUP.email, password: "wrong password" });
    assert.strictEqual(bad.status, 401);
    const ok = await call("POST", "/api/login", { email: "JOHN@rooferpro.com", password: SIGNUP.password });
    assert.strictEqual(ok.status, 200);
  } finally {
    server.close();
  }
});

test("accounts can't see or change each other's leads", async () => {
  const { server, base } = await start();
  const a = client(base), b = client(base);
  try {
    await a("POST", "/api/signup", SIGNUP);
    await b("POST", "/api/signup", Object.assign({}, SIGNUP, { email: "other@roofs.com", company: "Other Roofs" }));
    assert.strictEqual((await b("POST", "/api/signup", SIGNUP)).status, 409);

    await a("POST", "/api/leads/test", {});
    const leadId = (await a("GET", "/api/state")).body.leads[0].id;
    assert.strictEqual((await b("GET", "/api/state")).body.leads.length, 0);
    assert.strictEqual((await b("PATCH", "/api/leads/" + leadId, { status: "won" })).status, 404);
    assert.strictEqual((await b("DELETE", "/api/leads/" + leadId)).status, 404);
    await b("POST", "/api/leads/bulk", { ids: [leadId], action: "delete" });
    assert.strictEqual((await a("GET", "/api/state")).body.leads.length, 1);
  } finally {
    server.close();
  }
});

test("form endpoint validates input, accepts JSON, and drops spam", async () => {
  const { server, base } = await start();
  const call = client(base);
  try {
    await call("POST", "/api/signup", SIGNUP);
    const formPath = new URL((await call("GET", "/api/state")).body.formUrl).pathname;
    const post = (body) => fetch(base + formPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    let r = await post({ phone: "8645550100" });
    assert.strictEqual(r.status, 400);
    assert.match((await r.json()).error, /name/);
    r = await post({ name: "No Contact" });
    assert.strictEqual(r.status, 400);
    r = await post({ first_name: "Ann", last_name: "Lee", email: "ann@example.com" });
    assert.strictEqual(r.status, 201);
    r = await post({ name: "Spam Bot", phone: "1", _gotcha: "http://spam" });
    assert.strictEqual(r.status, 200);

    const leads = (await call("GET", "/api/state")).body.leads;
    assert.deepStrictEqual(leads.map((l) => l.name), ["Ann Lee"]);

    assert.strictEqual((await fetch(base + "/f/not-a-real-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
    // API rejects non-JSON posts, which blocks cross-site form attacks
    const csrf = await fetch(base + "/api/leads/test", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "" });
    assert.strictEqual(csrf.status, 415);
  } finally {
    server.close();
  }
});

test("new leads go untouched for 24 hours become missed", async () => {
  const { server, base } = await start();
  const call = client(base);
  try {
    await call("POST", "/api/signup", SIGNUP);
    await call("POST", "/api/leads/test", {});
    server.db.prepare("UPDATE leads SET received_at = received_at - ?").run(25 * 60 * 60 * 1000);
    const lead = (await call("GET", "/api/state")).body.leads[0];
    assert.strictEqual(lead.status, "missed");
  } finally {
    server.close();
  }
});

test("pages are served and paths can't escape the public folder", async () => {
  const { server, base } = await start();
  try {
    assert.match(await (await fetch(base + "/")).text(), /Every Roofing Lead/);
    assert.match(await (await fetch(base + "/signup")).text(), /Start your free trial/);
    assert.strictEqual((await fetch(base + "/site.css")).status, 200);
    const vid = await fetch(base + "/demo.mp4", { headers: { Range: "bytes=0-99" } });
    assert.strictEqual(vid.status, 206);
    assert.match(vid.headers.get("content-range"), /^bytes 0-99\/\d+$/);
    assert.strictEqual((await vid.arrayBuffer()).byteLength, 100);
    assert.strictEqual((await fetch(base + "/demo.mp4", { headers: { Range: "bytes=999999999-" } })).status, 416);
    assert.strictEqual((await fetch(base + "/nope")).status, 404);
    assert.strictEqual((await fetch(base + "/..%2fserver.js")).status, 404);
    assert.strictEqual((await fetch(base + "/healthz")).status, 200);
  } finally {
    server.close();
  }
});
