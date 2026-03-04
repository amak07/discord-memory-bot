# Discord Memory Bot

A Discord bot that saves and recalls conversation notes using AI summarization. Teams chat naturally in Discord, then say `/save landscaping discussion` — the bot reads recent messages, summarizes the key info, and stores it. Later, `/recall what's our landscaper's info?` retrieves it intelligently.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Discord:** discord.js v14 (slash commands)
- **AI:** Google Gemini 2.5 Flash (free tier)
- **Database:** Turso (cloud SQLite, free tier)

## Commands

- `npm.cmd run build` — Compile TypeScript
- `npm.cmd run dev` — Start bot in dev mode (tsx watch)
- `npm.cmd run start` — Start bot (compiled)
- `npm.cmd test` — Run tests (Vitest)
- `npm.cmd run deploy-commands` — Register slash commands with Discord

## Architecture

- **Entry point:** `src/index.ts` — Discord client setup, event handling
- **Commands:** `src/commands/` — slash command handlers (save, recall, notes)
- **Services:** `src/services/` — AI (Gemini), database (Turso), message fetching
- **Types:** `src/types.ts` — shared TypeScript interfaces
- **Command registration:** `src/deploy-commands.ts` — one-time script to register slash commands

## Local Development Workflow

Every time you start a dev session or after re-adding the bot to a server:

```bash
npm.cmd run deploy-commands   # Register slash commands (guild = instant)
npm.cmd run dev               # Start bot with hot reload
```

**Why both steps?** Guild commands are tied to the bot's presence in the server. If the bot is kicked and re-added, commands must be re-registered. The bot process (`dev`) must also be running for it to respond.

**Bot invite URL** (with required permissions — View Channels, Send Messages, Embed Links, Read Message History):
```
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=117760&scope=bot%20applications.commands
```

**Checking logs:** Bot output goes to the terminal running `npm run dev`. When running via Claude's Bash tool in background, check the output file for errors.

## Environment Variables

Required in `.env` (see `.env.example`):

```
DISCORD_TOKEN=           # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=       # Application ID for slash command registration
DISCORD_GUILD_ID=        # Server ID for instant guild command registration (dev mode)
GEMINI_API_KEY=          # From Google AI Studio (ai.google.dev)
TURSO_DATABASE_URL=      # From Turso dashboard
TURSO_AUTH_TOKEN=        # From Turso dashboard
```

## Production Deployment (Google Cloud)

The bot runs on a GCP e2-micro VM (Always Free tier) with pm2 for process management.

**Server:** Google Cloud e2-micro | Region: `us-central1` (Iowa) | OS: Ubuntu 24.04 LTS

### First-Time Setup

1. Create a GCP account at [cloud.google.com/free](https://cloud.google.com/free)
2. Create a new project, then create a VM:
   - Machine type: `e2-micro` | Region: `us-central1` | OS: Ubuntu 24.04 LTS | Disk: 30GB standard
3. SSH in: `gcloud compute ssh <vm-name>` (or use GCP Console SSH)
4. Clone repo and run setup:
   ```bash
   git clone https://github.com/YOUR_USERNAME/discord-memory-bot.git
   cd discord-memory-bot
   bash scripts/setup-server.sh
   ```
5. Create `.env` (setup script will prompt you), then re-run `bash scripts/setup-server.sh`

### CI/CD (Auto-Deploy)

Pushes to `master` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`). The workflow SSHs into the VM and runs the update script.

**GitHub Secrets required** (repo → Settings → Secrets → Actions):
- `GCP_HOST` — VM external IP
- `GCP_USERNAME` — SSH username
- `GCP_SSH_KEY` — Ed25519 private key (created on VM)

Check deploy status: GitHub repo → **Actions** tab.

### Manual Updates

```bash
# On the server (if CI/CD isn't set up yet):
bash scripts/update-server.sh
```

### Monitoring

```bash
pm2 status              # Is the bot running?
pm2 logs discord-bot    # View logs (Ctrl+C to exit)
pm2 monit               # Real-time dashboard
pm2 restart discord-bot # Manual restart
```

### Slash Commands

- With `DISCORD_GUILD_ID` set: guild commands (instant, dev only)
- Without `DISCORD_GUILD_ID`: global commands (up to 1 hour to propagate, production)

## Beads Task Management

Tasks persist across sessions in `.beads/`. Run at session start:

```bash
bd ready                                  # See pending tasks
bd create --title="..." --type=task       # Create task
bd update <id> --status=in_progress       # Start working
bd close <id> --reason="done"             # Complete task
```

**Issue Quality:** Every beads issue MUST have a meaningful description at creation time. Include what needs to be done, why it matters, and technical notes if relevant.

## Testing Rules

- **No sneaky implementation changes**: When writing tests, do NOT modify production code to make tests easier to write or pass. Tests must work against the current codebase as-is.
- **HARD STOP on production code changes**: If a test failure reveals a bug in production code, STOP — show the user what broke and wait for explicit approval before touching any production file.
- **Do not modify existing test files** unless the user has approved the change.

## Landing the Plane (Session Completion)

Work is NOT complete until changes are committed, pushed, and CI passes.

### 1. Run quality gates

```bash
npm.cmd test          # Unit tests
npm.cmd run build     # Build
```

### 2. Commit, push

```bash
git add <files>
git commit -m "..."
git push origin main
```

### 3. If CI fails

Investigate, fix, push again, repeat. Never leave broken CI.

**Critical rules:**
- NEVER say "ready to push when you are" — YOU must push
- If CI fails, resolve and retry until it passes

## Windows MINGW64

Use `npm.cmd` not `npm`, `npx.cmd` not `npx` when running commands via Claude Code's Bash tool (MINGW64 shell wrapper issue). The VS Code integrated terminal resolves these correctly on its own — this only applies to Claude's Bash tool.
