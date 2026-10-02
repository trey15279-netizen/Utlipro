"use strict";
// Runs a room: agents take turns replying to the conversation so far.
// The next speaker is whoever was @mentioned last; otherwise agents go in order.

const HISTORY_LIMIT = 30; // recent messages each agent sees

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function mentions(text, agent) {
  return new RegExp("@" + escapeRe(agent.name) + "(?![\\w-])", "i").test(text || "");
}

function nextSpeaker(agents, transcript) {
  if (!agents.length) return null;
  const done = transcript.filter((m) => m.status === "done");
  const last = done[done.length - 1];
  if (last) {
    const called = agents.find((a) => a.id !== last.agent_id && mentions(last.content, a));
    if (called) return called;
  }
  const lastAgentMsg = done.slice().reverse().find((m) => m.agent_id && agents.some((a) => a.id === m.agent_id));
  if (!lastAgentMsg) return agents[0];
  const i = agents.findIndex((a) => a.id === lastAgentMsg.agent_id);
  return agents[(i + 1) % agents.length];
}

function buildMessages(agent, agents, room, transcript) {
  const others = agents.filter((a) => a.id !== agent.id);
  const roster = others.length ? others.map((a) => "- " + a.name + (a.role ? ": " + a.role : "")).join("\n") : "- (no one else yet)";
  const system = [
    agent.prompt || "You are a helpful assistant.",
    "",
    "Your name is " + agent.name + (agent.role ? " (" + agent.role + ")" : "") + ". You're in a group conversation with the user and these agents:",
    roster,
    room.topic ? "\nTopic: " + room.topic : "",
    "",
    "Rules: Speak only as " + agent.name + ". Keep each reply to 2-5 sentences. Build on what others said instead of repeating it.",
    "Don't write lines for anyone else. To ask a specific agent something, mention them like @" + (others[0] ? others[0].name : "Name") + "."
  ].join("\n");

  const msgs = [{ role: "system", content: system }];
  transcript.filter((m) => m.status === "done" && m.content).slice(-HISTORY_LIMIT).forEach((m) => {
    if (m.agent_id === agent.id) msgs.push({ role: "assistant", content: m.content });
    else msgs.push({ role: "user", content: m.author + ": " + m.content });
  });
  if (msgs.length === 1) msgs.push({ role: "user", content: room.topic ? "Start the conversation about: " + room.topic : "Start the conversation." });
  else if (msgs[msgs.length - 1].role === "assistant") msgs.push({ role: "user", content: "(It's your turn again, " + agent.name + ". Continue the conversation.)" });
  return msgs;
}

// Models sometimes start their reply with their own name, like "Critic: ...". Strip it.
function tidy(agent, text) {
  return text.replace(new RegExp("^\\s*\\**" + escapeRe(agent.name) + "\\**\\s*:\\s*", "i"), "").trim();
}

function createRunner({ store, llm, baseUrl, emit }) {
  const active = new Map(); // roomId -> AbortController

  async function run(roomId, turns) {
    if (active.has(roomId)) return false;
    const controller = new AbortController();
    active.set(roomId, controller);
    emit(roomId, "running", { running: true });
    try {
      for (let t = 0; t < turns && !controller.signal.aborted; t++) {
        const room = store.getRoom(roomId);
        const agents = store.roomAgents(roomId);
        if (!room || !agents.length) break;
        const transcript = store.messages(roomId);
        const agent = nextSpeaker(agents, transcript);
        const msg = store.addMessage({ roomId, agentId: agent.id, author: agent.name, content: "", status: "streaming" });
        emit(roomId, "start", { message: msg });
        let text = "";
        try {
          for await (const piece of llm.chat({ baseUrl, model: agent.model, messages: buildMessages(agent, agents, room, transcript), signal: controller.signal })) {
            text += piece;
            emit(roomId, "token", { id: msg.id, text: piece });
          }
          text = tidy(agent, text);
          store.finishMessage(msg.id, text || "(no reply)", "done");
          emit(roomId, "done", { id: msg.id, content: text || "(no reply)" });
        } catch (e) {
          if (e.name === "AbortError") {
            store.finishMessage(msg.id, tidy(agent, text), "stopped");
            emit(roomId, "done", { id: msg.id, content: tidy(agent, text), status: "stopped" });
          } else {
            store.finishMessage(msg.id, e.message, "error");
            emit(roomId, "failed", { id: msg.id, error: e.message });
          }
          break;
        }
      }
    } finally {
      active.delete(roomId);
      emit(roomId, "running", { running: false });
    }
    return true;
  }

  return {
    start(roomId, turns) {
      if (active.has(roomId)) return false;
      run(roomId, turns).catch((e) => { console.error("room run failed", e); });
      return true;
    },
    stop(roomId) { const c = active.get(roomId); if (c) c.abort(); return !!c; },
    isRunning(roomId) { return active.has(roomId); },
    stopAll() { for (const c of active.values()) c.abort(); }
  };
}

module.exports = { createRunner, nextSpeaker, buildMessages, tidy };
