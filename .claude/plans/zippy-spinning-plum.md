# Discord Memory Bot — V1 Plan

## Context

Build a Discord bot that lets small teams save and recall conversation notes using AI summarization. The immediate use case is two brothers managing shared real estate properties via Discord — saving discussions about landscapers, contractors, property decisions, etc. and recalling them later with natural language queries.

The bot will be designed from day one to support multi-server use, so it can later become a paid product on Discord's marketplace.

**Stack (entirely free):**
- Discord.js v14 — bot framework
- Google Gemini 2.5 Flash — AI summarization + retrieval (free tier: 250 req/day)
- Turso — cloud SQLite database (free tier: 500 DBs, 9GB)
- TypeScript — type safety, maintainability

## Project Location

`c:\Users\abelm\Projects\discord-memory-bot\`

## Project Structure

```
discord-memory-bot/
├── src/
│   ├── index.ts              — bot entry point, client setup
│   ├── deploy-commands.ts    — one-time slash command registration
│   ├── commands/
│   │   ├── save.ts           — /save <topic> — summarize recent chat & store
│   │   ├── recall.ts         — /recall <query> — search notes & answer
│   │   └── notes.ts          — /notes — list all saved notes
│   ├── services/
│   │   ├── ai.ts             — Gemini API wrapper (summarize, answer)
│   │   ├── db.ts             — Turso client, schema init, queries
│   │   └── messages.ts       — fetch recent Discord messages
│   └── types.ts              — shared TypeScript interfaces
├── .env.example              — template for required env vars
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md                 — setup instructions for brother/cousin
```

## Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.x",
    "@google/generative-ai": "^0.x",
    "@libsql/client": "^0.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/node": "^20.x"
  }
}
```

## Database Schema (Turso)

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  raw_messages TEXT,          -- JSON array of original messages used
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_server ON notes(server_id);
CREATE INDEX idx_notes_topic ON notes(server_id, topic);
```

- `server_id` scopes notes per Discord server (multi-server ready from day 1)
- `raw_messages` stores the original messages so we can re-summarize or show sources later
- Simple schema — no vector embeddings for V1, just text search

## Slash Commands

### `/save <topic>`
1. User types `/save landscaping discussion`
2. Bot fetches the last 50 messages from the current channel
3. Sends messages to Gemini: *"Extract and summarize the key information about '{topic}' from these messages. Be concise but capture names, numbers, decisions, and action items."*
4. Stores the summary + raw messages in Turso
5. Replies with an embed showing what was saved:
   ```
   ✅ Note Saved: "landscaping discussion"
   ─────────────────────────────
   Decided to go with GreenCare Landscaping at $200/month.
   Contact: Mike, (555) 123-4567. Starting March 15.
   Brother will handle the first walkthrough.
   ─────────────────────────────
   Saved by @Abel • Today at 3:42 PM
   ```

### `/recall <query>`
1. User types `/recall what's our landscaper's info?`
2. Bot searches notes in DB using SQL LIKE (searching topic + summary fields)
3. Sends matching notes + the query to Gemini: *"Based on these saved notes, answer the question: '{query}'. If the notes don't contain the answer, say so."*
4. Replies with an embed:
   ```
   🧠 Memory Recall
   ─────────────────────────────
   Your landscaper is GreenCare Landscaping.
   Cost: $200/month. Contact: Mike at (555) 123-4567.
   Started March 15. Your brother handled the first walkthrough.
   ─────────────────────────────
   Source: "landscaping discussion" (saved Mar 3)
   ```

### `/notes`
1. Lists all saved notes for the current server
2. Shows topic, date, and a one-line preview
3. Paginated if there are many notes (embed with up to 10 per page)
   ```
   📋 Saved Notes (3 total)
   ─────────────────────────────
   1. landscaping discussion — Mar 3
      "GreenCare Landscaping at $200/month..."
   2. roof repair quotes — Feb 28
      "Three quotes received: ABC Roofing $4,200..."
   3. tenant screening — Feb 20
      "Decided on requiring 650+ credit score..."
   ```

## Key Implementation Details

### Message Fetching (services/messages.ts)
- Use `channel.messages.fetch({ limit: 50 })` to get recent messages
- Filter out bot messages
- Format as: `"@Username (3:42 PM): message content"` for the AI prompt
- Include timestamps so AI can understand conversation flow

### AI Service (services/ai.ts)
- Two functions: `summarizeConversation(topic, messages)` and `answerFromNotes(query, notes)`
- Use `gemini-2.5-flash` model
- Set temperature low (~0.3) for factual summarization
- System prompt establishes the bot as a note-taking assistant

### Database Service (services/db.ts)
- `initDb()` — creates table if not exists on startup
- `saveNote(note)` — insert a new note
- `searchNotes(serverId, query)` — `SELECT ... WHERE summary LIKE '%query%' OR topic LIKE '%query%'`
- `listNotes(serverId, limit)` — `SELECT ... ORDER BY created_at DESC`
- `deleteNote(id, serverId)` — for future use

### Bot Entry Point (src/index.ts)
- Create Discord client with `GatewayIntentBits.Guilds`, `GatewayIntentBits.GuildMessages`, `GatewayIntentBits.MessageContent`
- Register slash command handler
- Initialize database on startup
- Graceful shutdown

## Environment Variables (.env)

```
DISCORD_TOKEN=           # from Discord Developer Portal
DISCORD_CLIENT_ID=       # application ID for slash command registration
GEMINI_API_KEY=          # from Google AI Studio
TURSO_DATABASE_URL=      # from Turso dashboard
TURSO_AUTH_TOKEN=         # from Turso dashboard
```

## Setup Steps (for README)

1. **Discord Bot**: Create app at discord.com/developers, get token + client ID, invite to server with message read/send permissions
2. **Gemini**: Get free API key from ai.google.dev
3. **Turso**: Create account at turso.tech, create a database, get URL + auth token
4. **Clone & run**:
   ```bash
   git clone <repo>
   cd discord-memory-bot
   npm install
   cp .env.example .env    # fill in credentials
   npx tsx src/deploy-commands.ts   # register slash commands once
   npx tsx src/index.ts             # start the bot
   ```

## Build Order

1. Project scaffolding (package.json, tsconfig, .env.example, .gitignore)
2. Database service (Turso connection, schema, CRUD operations)
3. AI service (Gemini summarization + retrieval)
4. Message fetching utility
5. Slash command definitions + registration script
6. `/save` command implementation
7. `/recall` command implementation
8. `/notes` command implementation
9. Bot entry point (wire everything together)
10. README with setup instructions
11. Test end-to-end locally

---

## V2 — Document Storage & Retrieval (future, after V1 is stable)

### Overview
Users can upload files (PDFs, images, Word docs, text files) to the bot. The bot extracts text, stores it, and includes document content when answering `/recall` queries — so notes AND documents are searchable together.

### New Command: `/upload`
1. User sends a file (PDF, .docx, .txt, image) as a Discord attachment
2. User types `/upload lease agreement for 123 Main St`
3. Bot downloads the attachment, extracts text:
   - PDF → `pdf-parse` library
   - Word → `mammoth` library
   - Images → Gemini vision (describe/OCR the image)
   - Plain text → read directly
4. Stores extracted text + metadata in a new `documents` table
5. Confirms with a preview of extracted content

### New Database Table

```sql
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL,        -- pdf, docx, txt, image
  original_filename TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  uploaded_by_id TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Enhanced `/recall`
- Searches BOTH `notes` AND `documents` tables
- Sends matching results from both to Gemini
- Response cites whether the answer came from a conversation note or a document
- Example: `/recall what does our lease say about pet deposits?` → answers from the uploaded lease PDF

### New Command: `/docs`
- Lists all uploaded documents for the current server
- Shows title, file type, upload date, who uploaded it

### Additional Dependencies (V2 only)
```json
{
  "pdf-parse": "^1.x",
  "mammoth": "^1.x"
}
```

### V2 Considerations
- File size limits (Discord caps attachments at 25MB, which is plenty)
- Large PDFs may need to be chunked for storage/retrieval
- Image OCR via Gemini vision counts against the free API quota
- May want to add `/delete` command for notes and documents

---

## Verification

1. Start the bot: `npx tsx src/index.ts` — should log "Bot is online"
2. In Discord, type `/save test discussion` — bot should summarize recent messages and confirm
3. Type `/recall test` — bot should find and return the saved note
4. Type `/notes` — should list the saved note
5. Verify in Turso dashboard that the note was persisted
