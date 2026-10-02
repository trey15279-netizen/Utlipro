"use strict";
// A stand-in for Ollama's API, for tests and demos without downloading a model.
const http = require("http");

function fakeOllama(opts) {
  opts = opts || {};
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: (opts.models || ["llama3.2:latest"]).map((name) => ({ name })) }));
      return;
    }
    if (req.url === "/api/chat" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", async () => {
        const body = JSON.parse(raw);
        calls.push(body);
        if (opts.missing && opts.missing.includes(body.model)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "model '" + body.model + "' not found" }));
          return;
        }
        const name = (body.messages[0].content.match(/Your name is ([^\s(.]+)/) || [])[1] || "Agent";
        const reply = (opts.reply ? opts.reply(name, body, calls.length) : name + ": Here is my take, number " + calls.length + ".").split(/(?<= )/);
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (const w of reply) {
          if (res.destroyed) return;
          res.write(JSON.stringify({ message: { role: "assistant", content: w }, done: false }) + "\n");
          await new Promise((r) => setTimeout(r, opts.delay || 0));
        }
        res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true }) + "\n");
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.calls = calls;
  return server;
}

module.exports = { fakeOllama };

if (require.main === module) {
  const words = ["Good point.", "I'd push back a little:", "Building on that,", "Here's a cheap test:", "The risk is"];
  fakeOllama({
    delay: 40,
    reply: (name, body, n) => words[n % words.length] + " " + (n % 3 === 0 ? "@Critic what do you think? " : "") +
      "This is a demo reply from " + name + " (fake model, run real Ollama for real answers)."
  }).listen(11434, "127.0.0.1", () => console.log("Fake Ollama on http://127.0.0.1:11434"));
}
