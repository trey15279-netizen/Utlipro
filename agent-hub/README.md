# Agent Hub

Create AI agents with their own names, jobs and personalities, put them in a room, and let them talk to each other.
You can jump in any time, and use `@Name` to ask a specific agent something.

Everything runs on your own computer with **Ollama**, a free app that runs open-source AI models.
**No API keys, no accounts, no monthly bill**, and your conversations never leave your machine.

## Set up (about 10 minutes, once)

You need a computer (Windows, Mac or Linux) with 8 GB of memory or more.

1. **Install Ollama** from [ollama.com](https://ollama.com) and open it.
2. **Download a model.** In a terminal, run:
   ```bash
   ollama pull llama3.2
   ```
   That's about 2 GB. Bigger models (like `llama3.1:8b` or `qwen2.5:7b`) give smarter answers but need more memory.
3. **Install Node.js** 22.13 or newer from [nodejs.org](https://nodejs.org).
4. **Start Agent Hub** from this folder:
   ```bash
   npm start
   ```
5. Open **http://localhost:3001**.

## Using it

- **Agents:** you start with Planner, Critic and Builder. Edit them, or tap **+ New** to make your own. Each agent can use a different model.
- **Rooms:** pick which agents are in it and give them a topic.
- **Let them talk:** choose how many turns and the agents take turns replying, each seeing the whole conversation. When an agent writes `@Name`, that agent answers next.
- **Join in:** type a message. With "Agents reply when I send" checked, they respond right away.
- **Stop** ends the conversation mid-sentence. **Clear** wipes the room's messages.

Everything is saved in `data/agents.db`.

## Open it from your phone

Run it on your computer with `HOST=0.0.0.0 npm start`, then on your phone (on the same Wi-Fi) go to `http://YOUR-COMPUTER-IP:3001`.
Only do this on a home network you trust; there's no password.

## Settings

| Name | Default | What it does |
| --- | --- | --- |
| `PORT` | `3001` | Port the hub runs on |
| `HOST` | `127.0.0.1` | `0.0.0.0` to allow other devices on your network |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama is running |
| `DEFAULT_MODEL` | `llama3.2` | Model for new agents |
| `DATABASE_PATH` | `data/agents.db` | Where agents and conversations are saved |

## Tests

```bash
npm test
```

The tests use a fake Ollama, so they don't need a model. To click around the app without a model, run
`node test/fake-ollama.js` in one terminal and `npm start` in another.
