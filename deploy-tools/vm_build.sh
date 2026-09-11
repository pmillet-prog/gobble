#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:?REPO_DIR doit pointer vers la version a construire}"
cd "$REPO_DIR"

# --- Runtime persistant hors du code deploye ---
RUNTIME_DIR="$HOME/gobble_runtime"
mkdir -p "$RUNTIME_DIR"

DATA_RUNTIME_PATH="$REPO_DIR/server/data-runtime"
if [ -e "$DATA_RUNTIME_PATH" ] && [ ! -L "$DATA_RUNTIME_PATH" ]; then
  cp -a "$DATA_RUNTIME_PATH/." "$RUNTIME_DIR"/
  rm -rf "$DATA_RUNTIME_PATH"
fi
mkdir -p "$REPO_DIR/server"
ln -sfn "$RUNTIME_DIR" "$DATA_RUNTIME_PATH"
export GOBBLE_DATA_DIR="$RUNTIME_DIR"

REPO_DATA_DIR="$REPO_DIR/server/data"
ROOT_DATA_DIR="$REPO_DIR/data"
mkdir -p "$REPO_DATA_DIR" "$ROOT_DATA_DIR"

# Page statique de maintenance
MAINTENANCE_PAGE_SOURCE="$REPO_DIR/ops/maintenance/index.html"
MAINTENANCE_PAGE_ROOT="/var/www/gobble-maintenance"
if [ -f "$MAINTENANCE_PAGE_SOURCE" ]; then
  echo "=== Refresh static maintenance page ==="
  sudo install -d -o root -g root -m 0755 "$MAINTENANCE_PAGE_ROOT"
  sudo install -o root -g root -m 0644 "$MAINTENANCE_PAGE_SOURCE" "$MAINTENANCE_PAGE_ROOT/index.html"
fi

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
ln -sfn "$DB_TARGET" "$DB_SOURCE"

# --- Build identique a l'ancien vm_update.sh ---
echo "=== Front: install + build ==="
npm ci
ASSET_COMPAT_DIR="$REPO_DIR/.deploy-asset-compat"
rm -rf "$ASSET_COMPAT_DIR"
mkdir -p "$ASSET_COMPAT_DIR"
if [ -d "$REPO_DIR/dist/assets" ]; then
  find "$REPO_DIR/dist/assets" -maxdepth 1 -type f \( -name "*.js" -o -name "*.css" \) -mtime -7 -exec cp -p {} "$ASSET_COMPAT_DIR"/ \; 2>/dev/null || true
fi
npm run build
if [ -d "$ASSET_COMPAT_DIR" ] && [ -d "$REPO_DIR/dist/assets" ]; then
  find "$ASSET_COMPAT_DIR" -maxdepth 1 -type f -exec cp -n {} "$REPO_DIR/dist/assets"/ \; 2>/dev/null || true
  find "$REPO_DIR/dist/assets" -maxdepth 1 -type f \( -name "*.js" -o -name "*.css" \) -mtime +14 -delete 2>/dev/null || true
fi
rm -rf "$ASSET_COMPAT_DIR"

echo "=== Server: install ==="
cd "$REPO_DIR/server"
npm ci
cd "$REPO_DIR"

echo "=== Definitions databases: conservees telles quelles sur la VM; aucun backfill automatique ==="

echo "=== Build OK ==="
