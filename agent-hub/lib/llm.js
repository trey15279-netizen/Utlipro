"use strict";
// Talks to Ollama, which runs AI models on your own computer. No API key or account needed.
// https://github.com/ollama/ollama/blob/main/docs/api.md

class LlmError extends Error {}

function friendly(e, baseUrl, model) {
  if (e.name === "AbortError") return e;
  if (e instanceof LlmError) return e;
  const code = e.cause && e.cause.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || /fetch failed/i.test(e.message)) {
    return new LlmError("Can't reach Ollama at " + baseUrl + ". Install it from ollama.com and make sure it's running.");
  }
  return new LlmError("The model " + (model ? "\"" + model + "\" " : "") + "failed: " + e.message);
}

// Streams a reply, yielding text pieces as the model writes them.
async function* chat({ baseUrl, model, messages, signal, options }) {
  let res;
  try {
    res = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, options: Object.assign({ temperature: 0.8 }, options || {}) }),
      signal
    });
  } catch (e) { throw friendly(e, baseUrl, model); }

  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).error || ""; } catch (e) { /* ignore */ }
    if (res.status === 404 || /not found/i.test(msg)) throw new LlmError("The model \"" + model + "\" isn't downloaded yet. Run: ollama pull " + model);
    throw new LlmError("Ollama error " + res.status + (msg ? ": " + msg : ""));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new LlmError(j.error);
        if (j.message && j.message.content) yield j.message.content;
        if (j.done) return;
      }
    }
  } catch (e) { throw friendly(e, baseUrl, model); }
}

// Lists models you've downloaded with `ollama pull`. Returns null when Ollama isn't running.
async function listModels(baseUrl) {
  try {
    const res = await fetch(baseUrl + "/api/tags", { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.models || []).map((m) => m.name).sort();
  } catch (e) { return null; }
}

module.exports = { chat, listModels, LlmError };
