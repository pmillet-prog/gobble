#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PAGE_SOURCE="$REPO_DIR/ops/maintenance/index.html"
CADDY_SOURCE="$REPO_DIR/ops/caddy/Caddyfile"
PAGE_ROOT="/var/www/gobble-maintenance"
CADDY_TARGET="/etc/caddy/Caddyfile"
BACKUP_PATH="/etc/caddy/Caddyfile.gobble-before-maintenance"
ROLLBACK_PATH="/etc/caddy/Caddyfile.gobble-rollback.$$"

if [ ! -f "$PAGE_SOURCE" ] || [ ! -f "$CADDY_SOURCE" ]; then
  echo "ERREUR: fichiers de maintenance introuvables dans le dépôt." >&2
  exit 1
fi

echo "=== Installation de la page statique ==="
sudo install -d -o root -g root -m 0755 "$PAGE_ROOT"
sudo install -o root -g root -m 0644 "$PAGE_SOURCE" "$PAGE_ROOT/index.html"

echo "=== Validation de la configuration Caddy ==="
sudo caddy validate --config "$CADDY_SOURCE" --adapter caddyfile

if [ -f "$CADDY_TARGET" ] && [ ! -f "$BACKUP_PATH" ]; then
  sudo cp -p "$CADDY_TARGET" "$BACKUP_PATH"
fi
if [ -f "$CADDY_TARGET" ]; then
  sudo cp -p "$CADDY_TARGET" "$ROLLBACK_PATH"
fi

sudo install -o root -g root -m 0644 "$CADDY_SOURCE" "$CADDY_TARGET"

if ! sudo systemctl reload caddy; then
  echo "ERREUR: rechargement Caddy impossible, restauration de la configuration précédente." >&2
  if [ -f "$ROLLBACK_PATH" ]; then
    sudo cp -p "$ROLLBACK_PATH" "$CADDY_TARGET"
    sudo systemctl reload caddy
  fi
  sudo rm -f "$ROLLBACK_PATH"
  exit 1
fi

sudo rm -f "$ROLLBACK_PATH"
sudo systemctl is-active --quiet caddy
echo "OK: page de maintenance installée et Caddy rechargé sans redémarrer Gobble."
