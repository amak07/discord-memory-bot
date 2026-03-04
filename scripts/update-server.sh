#!/usr/bin/env bash
# Pull latest code, rebuild, and restart the bot
# Run on the server: bash scripts/update-server.sh

set -euo pipefail

APP_DIR="$HOME/discord-memory-bot"
cd "$APP_DIR"

echo "=== Updating Discord Memory Bot ==="

echo "Pulling latest code..."
git pull origin master

echo "Installing dependencies..."
npm ci

echo "Building TypeScript..."
npm run build

echo "Restarting bot..."
pm2 restart discord-bot

echo "=== Update Complete ==="
pm2 status
