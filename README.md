<p align="center">
  <img src="assets/logo.svg" alt="Discord Memory Bot" width="150" height="150">
</p>

<h1 align="center">Discord Memory Bot</h1>

<p align="center">
  <strong>Your team's shared second brain — right inside Discord.</strong>
</p>

<p align="center">
  Save conversations. Recall knowledge. Never lose context again.
</p>

---

## What is this?

A Discord bot that turns your chat conversations into a searchable knowledge base. Chat naturally with your team, then tell the bot to save what matters. Later, ask it to recall anything — it remembers so you don't have to.

### The problem

Important info gets buried in Discord chat. Contractor names, account details, decisions, plans — they're all somewhere in your message history, but good luck finding them when you need them.

### The solution

```
You:  /save landscaping discussion
Bot:  ✅ Saved: "GreenCare Landscaping at $200/month. Contact: Mike, (555) 123-4567.
      Starting March 15. Brother handling first walkthrough."

— 3 weeks later —

You:  /recall what's our landscaper's info?
Bot:  🧠 Your landscaper is GreenCare Landscaping. $200/month.
      Contact Mike at (555) 123-4567. Started March 15.
```

## Features

### V1 — Conversation Memory (current)
- `/save <topic>` — Bot reads recent chat, AI-summarizes the relevant info, saves it
- `/recall <query>` — Search saved notes with natural language, get AI-powered answers
- `/notes` — List all saved notes with previews
- Multi-server ready — each server gets its own isolated notes
- Free to run — no paid APIs or hosting required

### V2 — Document Storage (planned)
- `/upload <title>` — Upload PDFs, Word docs, images, text files
- Bot extracts text and stores it alongside conversation notes
- `/recall` searches both notes AND documents
- `/docs` — List uploaded documents

## Tech Stack

| Component | Technology | Cost |
|-----------|-----------|------|
| Bot framework | Discord.js v14 | Free |
| AI | Google Gemini 2.5 Flash | Free (250 req/day) |
| Database | Turso (cloud SQLite) | Free (9GB, 500 DBs) |
| Language | TypeScript | Free |

**Total cost: $0**

## Quick Start

### Prerequisites

1. **Discord Bot** — Create at [discord.com/developers](https://discord.com/developers/applications). Get bot token + client ID.
2. **Gemini API Key** — Get free at [ai.google.dev](https://ai.google.dev). No credit card needed.
3. **Turso Database** — Create at [turso.tech](https://turso.tech). Get database URL + auth token.

### Setup

```bash
git clone https://github.com/amak07/discord-memory-bot.git
cd discord-memory-bot
npm install
cp .env.example .env          # Fill in your credentials
npm run deploy-commands        # Register slash commands (once)
npm run dev                    # Start the bot
```

### Invite the bot

Use the OAuth2 URL generator in the Discord Developer Portal:
- Scopes: `bot`, `applications.commands`
- Permissions: `Send Messages`, `Read Message History`

## Project Structure

```
src/
├── index.ts              — Bot entry point
├── deploy-commands.ts    — Slash command registration
├── commands/
│   ├── save.ts           — /save — summarize & store conversation
│   ├── recall.ts         — /recall — search & answer from notes
│   └── notes.ts          — /notes — list saved notes
├── services/
│   ├── ai.ts             — Gemini API (summarize, answer)
│   ├── db.ts             — Turso database (schema, CRUD)
│   └── messages.ts       — Discord message fetching
└── types.ts              — Shared interfaces
```

## License

MIT
