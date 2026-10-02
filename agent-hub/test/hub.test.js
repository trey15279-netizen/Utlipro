"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../server");
const { fakeOllama } = require("./fake-ollama");
const { nextSpeaker, tidy } = require("../lib/runner");

async function listen(server) {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return "http://127.0.0.1:" + server.address().port;
}
async function start(fakeOpts) {
  const ollama = fakeOllama(fakeOpts);
  const ollamaUrl = await listen(ollama);
  const app = createApp({ dbPath: ":memory:", env: { OLLAMA_URL: ollamaUrl, DEFAULT_MODEL: "llama3.2:latest" } });
  const base = await listen(app);
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { app, ollama, base, call, close: () => { app.close(); ollama.close(); } };
}
async function waitIdle(call, roomId) {
  for (let i = 0; i < 200; i++) {
    const r = (await call("GET", "/api/rooms/" + roomId)).body;
    if (!r.running) return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error("room never finished");
}

test("starter agents exist and agents can be created, edited and deleted", async () => {
  const t = await start();
  try {
    const agents = (await t.call("GET", "/api/agents")).body;
    assert.deepStrictEqual(agents.map((a) => a.name), ["Planner", "Critic", "Builder"]);
    const made = await t.call("POST", "/api/agents", { name: "Researcher", role: "Finds facts", prompt: "Be thorough.", model: "llama3.2:latest", color: "#123456" });
    assert.strictEqual(made.status, 201);
    assert.strictEqual((await t.call("POST", "/api/agents", { name: "researcher" })).status, 409);
    assert.strictEqual((await t.call("POST", "/api/agents", { name: "" })).status, 400);
    assert.strictEqual((await t.call("PATCH", "/api/agents/" + made.body.id, { role: "Digs deep" })).body.role, "Digs deep");
    await t.call("DELETE", "/api/agents/" + made.body.id);
    assert.strictEqual((await t.call("GET", "/api/agents")).body.length, 3);
    const status = (await t.call("GET", "/api/status")).body;
    assert.strictEqual(status.ollama, true);
    assert.deepStrictEqual(status.models, ["llama3.2:latest"]);
  } finally { t.close(); }
});

test("agents take turns in a room, see each other's messages, and answer @mentions", async () => {
  const t = await start({ reply: (name, body, n) => (n === 1 ? "Let's start. @Builder your idea?" : "My turn, " + name + " here.") });
  try {
    const agents = (await t.call("GET", "/api/agents")).body; // Planner, Critic, Builder
    const room = (await t.call("POST", "/api/rooms", { title: "Ideas", topic: "Make $500 a month", agentIds: agents.map((a) => a.id) })).body;
    assert.strictEqual((await t.call("POST", "/api/rooms/" + room.id + "/run", { turns: 3 })).status, 202);
    const done = await waitIdle(t.call, room.id);
    // Planner starts, @Builder is called next, then round-robin continues to Planner
    assert.deepStrictEqual(done.messages.map((m) => m.author), ["Planner", "Builder", "Planner"]);
    assert.ok(done.messages.every((m) => m.status === "done"));
    assert.strictEqual(done.messages[1].content, "My turn, Builder here.");

    // Builder's request included the topic, the other agents, and Planner's message as a user turn
    const builderCall = t.ollama.calls[1];
    assert.match(builderCall.messages[0].content, /Your name is Builder/);
    assert.match(builderCall.messages[0].content, /Topic: Make \$500 a month/);
    assert.match(builderCall.messages[0].content, /- Planner/);
    assert.deepStrictEqual(builderCall.messages[1], { role: "user", content: "Planner: Let's start. @Builder your idea?" });

    // The user joins in and asks Critic directly
    await t.call("POST", "/api/rooms/" + room.id + "/messages", { content: "@Critic what could go wrong?" });
    await t.call("POST", "/api/rooms/" + room.id + "/run", { turns: 1 });
    const after = await waitIdle(t.call, room.id);
    assert.deepStrictEqual(after.messages.slice(-2).map((m) => m.author), ["You", "Critic"]);
  } finally { t.close(); }
});

test("stop interrupts the conversation, and missing models give a clear error", async () => {
  const t = await start({ delay: 30, reply: () => "one two three four five six seven eight nine ten eleven twelve", missing: ["ghost"] });
  try {
    const agents = (await t.call("GET", "/api/agents")).body;
    const room = (await t.call("POST", "/api/rooms", { title: "Long", agentIds: [agents[0].id] })).body;
    await t.call("POST", "/api/rooms/" + room.id + "/run", { turns: 10 });
    assert.strictEqual((await t.call("POST", "/api/rooms/" + room.id + "/run", { turns: 1 })).status, 409);
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual((await t.call("POST", "/api/rooms/" + room.id + "/stop", {})).body.stopped, true);
    const stopped = await waitIdle(t.call, room.id);
    assert.strictEqual(stopped.messages.length, 1);
    assert.strictEqual(stopped.messages[0].status, "stopped");

    const ghost = (await t.call("POST", "/api/agents", { name: "Ghost", model: "ghost" })).body;
    const room2 = (await t.call("POST", "/api/rooms", { title: "Broken", agentIds: [ghost.id] })).body;
    await t.call("POST", "/api/rooms/" + room2.id + "/run", { turns: 3 });
    const failed = await waitIdle(t.call, room2.id);
    assert.strictEqual(failed.messages.length, 1, "stops after the first error");
    assert.strictEqual(failed.messages[0].status, "error");
    assert.match(failed.messages[0].content, /ollama pull ghost/);
  } finally { t.close(); }
});

test("a clear message when Ollama isn't running", async () => {
  const app = createApp({ dbPath: ":memory:", env: { OLLAMA_URL: "http://127.0.0.1:9" } });
  const base = await listen(app);
  try {
    const status = await (await fetch(base + "/api/status")).json();
    assert.strictEqual(status.ollama, false);
    const agents = await (await fetch(base + "/api/agents")).json();
    const room = await (await fetch(base + "/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "x", agentIds: [agents[0].id] }) })).json();
    await fetch(base + "/api/rooms/" + room.id + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    let r;
    for (let i = 0; i < 100; i++) { r = await (await fetch(base + "/api/rooms/" + room.id)).json(); if (!r.running) break; await new Promise((x) => setTimeout(x, 20)); }
    assert.match(r.messages[0].content, /Can't reach Ollama/);
    // Other websites can't send commands
    assert.strictEqual((await fetch(base + "/api/rooms/" + room.id + "/run", { method: "POST", body: "turns=5" })).status, 415);
  } finally { app.close(); }
});

test("speaker order and reply cleanup", () => {
  const A = { id: "a", name: "Planner" }, B = { id: "b", name: "Critic" }, C = { id: "c", name: "Builder" };
  const msg = (agent, content) => ({ agent_id: agent ? agent.id : null, author: agent ? agent.name : "You", content, status: "done" });
  assert.strictEqual(nextSpeaker([A, B, C], []), A);
  assert.strictEqual(nextSpeaker([A, B, C], [msg(A, "hi")]), B);
  assert.strictEqual(nextSpeaker([A, B, C], [msg(A, "hi"), msg(B, "yo")]), C);
  assert.strictEqual(nextSpeaker([A, B, C], [msg(A, "hi"), msg(B, "@Planner thoughts?")]), A);
  assert.strictEqual(nextSpeaker([A, B, C], [msg(C, "x"), msg(null, "@critic go")]), B);
  assert.strictEqual(nextSpeaker([A, B, C], [msg(A, "email me @Plannerx")]), B, "partial names don't count");
  assert.strictEqual(tidy(B, "Critic: Too risky."), "Too risky.");
  assert.strictEqual(tidy(B, "**Critic**: Too risky."), "Too risky.");
});
