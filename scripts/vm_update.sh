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

export GOBBLE_DATA_DIR="$RUNTIME_DIR"

REPO_DATA_DIR="$REPO_DIR/server/data"
ROOT_DATA_DIR="$REPO_DIR/data"
mkdir -p "$REPO_DATA_DIR"
mkdir -p "$ROOT_DATA_DIR"

migrate_runtime_file() {
  local name="$1"
  local source="$REPO_DATA_DIR/$name"
  local target="$RUNTIME_DIR/$name"
  if [ -e "$source" ] && [ ! -L "$source" ]; then
    if [ ! -e "$target" ]; then
      mv "$source" "$target"
    else
      rm -rf "$source"
    fi
  fi
  ln -sfn "$target" "$source"
}

DAILY_SOURCE="$REPO_DATA_DIR/daily"
DAILY_TARGET="$RUNTIME_DIR/daily"
mkdir -p "$DAILY_TARGET"
if [ -e "$DAILY_SOURCE" ] && [ ! -L "$DAILY_SOURCE" ]; then
  cp -a "$DAILY_SOURCE/." "$DAILY_TARGET"/
  rm -rf "$DAILY_SOURCE"
fi
ln -sfn "$DAILY_TARGET" "$DAILY_SOURCE"

migrate_runtime_file "weekly-stats.json"
migrate_runtime_file "team-duel.json"
migrate_runtime_file "install-aliases.json"

migrate_root_runtime_file() {
  local name="$1"
  local source="$ROOT_DATA_DIR/$name"
  local target="$RUNTIME_DIR/$name"
  if [ -e "$source" ] && [ ! -L "$source" ]; then
    if [ ! -e "$target" ]; then
      mv "$source" "$target"
    else
      rm -f "$source"
    fi
  fi
  ln -sfn "$target" "$source"
}

migrate_root_runtime_file "playtime-limits.json"

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

stop_port() {
  local port="$1"
  local pids
  pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi
  kill -TERM $pids 2>/dev/null || true
  for _ in {1..6}; do
    sleep 0.5
    if ! fuser -n tcp "$port" >/dev/null 2>&1; then
      break
    fi
  done
  if fuser -n tcp "$port" >/dev/null 2>&1; then
    kill -KILL $pids 2>/dev/null || true
  fi
}

stop_gobble_service() {
  local service="$1"
  local port="$2"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$service" --no-legend 2>/dev/null | grep -q "^$service"; then
    sudo systemctl stop "$service"
    return
  fi
  stop_port "$port"
}

echo "=== Update repo already pulled by caller ==="

echo "=== Stop services before build to free RAM ==="
stop_gobble_service gobble-back.service 4000
stop_gobble_service gobble-front.service 3000

echo "=== Front: install + build ==="
npm ci
npm run build

echo "=== Server: install ==="
cd server
npm ci
cd "$REPO_DIR"

echo "=== Definitions: semantic themes backfill if needed ==="
if [ -f "$REPO_DIR/data/definitions-fr.sqlite" ]; then
  node server/scripts/backfill-game-semantic-themes.mjs --if-needed
  node server/scripts/backfill-word-linguistic-facts.mjs --if-needed
else
  echo "WARN: data/definitions-fr.sqlite not found; skipping definitions backfills"
fi

restart_gobble_service() {
  local service="$1"
  local port="$2"
  local log_name="$3"
  shift 3
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$service" --no-legend 2>/dev/null | grep -q "^$service"; then
    sudo systemctl restart "$service"
    return
  fi
  stop_port "$port"
  nohup "$@" > "$HOME/$log_name" 2>&1 &
}

echo "=== Restart back (4000) ==="
cd "$REPO_DIR/server"
restart_gobble_service gobble-back.service 4000 server.log npm start

echo "=== Restart front (3000) ==="
cd "$REPO_DIR"
restart_gobble_service gobble-front.service 3000 front.log npx serve -s dist -l 3000


echo "=== Ports ==="
ss -lntp | egrep '(:3000|:4000)\b' || true

echo "OK. Logs:"
echo "  $HOME/front.log"
echo "  $HOME/server.log"
