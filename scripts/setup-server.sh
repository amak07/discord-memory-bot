#!/usr/bin/env bash
# First-time server setup for Discord Memory Bot on Ubuntu (GCP e2-micro)
# Run this after SSH-ing into a fresh VM:
#   curl -fsSL https://raw.githubusercontent.com/<your-repo>/master/scripts/setup-server.sh | bash
# Or clone the repo first, then: bash scripts/setup-server.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/discord-memory-bot.git}"
APP_DIR="$HOME/discord-memory-bot"
NODE_VERSION="22"

echo "=== Discord Memory Bot - Server Setup ==="

# 1. Install Node.js via NodeSource
if ! command -v node &>/dev/null; then
  echo "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node.js already installed: $(node --version)"
fi

# 2. Install pm2
if ! command -v pm2 &>/dev/null; then
  echo "Installing pm2..."
  sudo npm install -g pm2
else
  echo "pm2 already installed: $(pm2 --version)"
fi

# 3. Clone or update repo
if [ -d "$APP_DIR" ]; then
  echo "Repo already exists at $APP_DIR, pulling latest..."
  cd "$APP_DIR"
  git pull origin master
else
  echo "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 4. Install dependencies and build
echo "Installing dependencies..."
npm ci

echo "Building TypeScript..."
npm run build

# 5. Create .env file if it doesn't exist
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "=== Environment Setup ==="
  echo "Create your .env file with the required variables."
  echo "You can copy from .env.example and fill in the values:"
  echo ""
  echo "  cp .env.example .env"
  echo "  nano .env"
  echo ""
  echo "Required variables:"
  echo "  DISCORD_TOKEN       - Bot token from Discord Developer Portal"
  echo "  DISCORD_CLIENT_ID   - Application ID for slash commands"
  echo "  GEMINI_API_KEY      - From Google AI Studio (ai.google.dev)"
  echo "  TURSO_DATABASE_URL  - From Turso dashboard"
  echo "  TURSO_AUTH_TOKEN    - From Turso dashboard"
  echo ""
  echo "After creating .env, run: bash scripts/start-bot.sh"
  exit 0
else
  echo ".env file exists, continuing..."
fi

# 6. Register Discord slash commands (global, takes up to 1 hour)
echo "Registering global slash commands..."
node --import tsx src/deploy-commands.ts

# 7. Start bot with pm2
echo "Starting bot with pm2..."
pm2 delete discord-bot 2>/dev/null || true
pm2 start dist/index.js --name discord-bot

# 8. Configure pm2 to auto-start on reboot
echo "Configuring auto-start on reboot..."
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash
pm2 save

echo ""
echo "=== Setup Complete ==="
echo "Bot is running! Useful commands:"
echo "  pm2 status              - Check if bot is running"
echo "  pm2 logs discord-bot    - View bot logs"
echo "  pm2 monit               - Real-time monitoring"
echo "  pm2 restart discord-bot - Restart bot"
