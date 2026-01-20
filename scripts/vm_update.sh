#!/usr/bin/env bash
set -euo pipefail

# Ce script est execute SUR la VM, depuis le repo clone (ex: ~/gobble_git)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# --- Runtime persistence (avant install/build) ---
RUNTIME_DIR="$HOME/gobble_runtime"
mkdir -p "$RUNTIME_DIR"

DATA_RUNTIME_PATH="$REPO_DIR/server/data-runtime"
if [ -e "$DATA_RUNTIME_PATH" ] && [ ! -L "$DATA_RUNTIME_PATH" ]; then
  cp -a "$DATA_RUNTIME_PATH/." "$RUNTIME_DIR"/
  rm -rf "$DATA_RUNTIME_PATH"
fi
ln -sfn "$RUNTIME_DIR" "$DATA_RUNTIME_PATH"

# IMPORTANT: weekly legacy file is tracked by git and can override runtime; delete it every deploy.
rm -f "$REPO_DIR/server/data/weekly-stats.json" 2>/dev/null || true
export GOBBLE_DATA_DIR="$RUNTIME_DIR"

DB_SOURCE="$REPO_DIR/server/data/gobble.db"
DB_TARGET="$RUNTIME_DIR/gobble.db"
if [ -e "$DB_SOURCE" ] && [ ! -L "$DB_SOURCE" ]; then
  if [ ! -e "$DB_TARGET" ]; then
    mv "$DB_SOURCE" "$DB_TARGET"
  else
    rm -f "$DB_SOURCE"
  fi
fi
mkdir -p "$REPO_DIR/server/data"
ln -sfn "$DB_TARGET" "$DB_SOURCE"

# Ce script est exécuté SUR la VM, depuis le repo cloné (ex: ~/gobble_git)

echo "=== Update repo already pulled by caller ==="

echo "=== Front: install + build ==="
npm ci
npm run build

echo "=== Server: install ==="
cd server
npm ci

echo "=== Restart back (4000) ==="
fuser -k 4000/tcp 2>/dev/null || true
nohup npm start > "$HOME/server.log" 2>&1 &


echo "=== Restart front (3000) ==="
fuser -k 3000/tcp 2>/dev/null || true
cd ..
nohup npx serve -s dist -l 3000 > "$HOME/front.log" 2>&1 &


echo "=== Ports ==="
ss -lntp | egrep '(:3000|:4000)\b' || true

echo "OK. Logs:"
echo "  $HOME/front.log"
echo "  $HOME/server.log"
