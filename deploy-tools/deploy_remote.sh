#!/usr/bin/env bash
set -euo pipefail

LIVE="$HOME/gobble_git"
INCOMING="$HOME/gobble_incoming"
BACKUP="$HOME/gobble_backup"
FAILED="$HOME/gobble_failed_last"
UPLOAD="$HOME/gobble_upload.tar.gz"
BUILDER="$HOME/gobble_vm_build.sh"

stop_port() {
  local port="$1"
  local pids
  pids="$(fuser -n tcp "$port" 2>/dev/null || true)"
  [ -z "$pids" ] && return 0
  kill -TERM $pids 2>/dev/null || true
  for _ in {1..6}; do
    sleep 0.5
    if ! fuser -n tcp "$port" >/dev/null 2>&1; then
      return 0
    fi
  done
  kill -KILL $pids 2>/dev/null || true
}

has_service() {
  local service="$1"
  command -v systemctl >/dev/null 2>&1 && \
    systemctl list-unit-files "$service" --no-legend 2>/dev/null | grep -q "^$service"
}

stop_services() {
  echo "=== Stop Gobble services ==="
  if has_service gobble-back.service; then
    sudo systemctl stop gobble-back.service || true
  else
    stop_port 4000
  fi
  if has_service gobble-front.service; then
    sudo systemctl stop gobble-front.service || true
  else
    stop_port 3000
  fi
}

start_services() {
  echo "=== Start Gobble services ==="
  if has_service gobble-back.service; then
    sudo systemctl restart gobble-back.service
  else
    stop_port 4000
    (cd "$LIVE/server" && NODE_ENV=production nohup npm start > "$HOME/server.log" 2>&1 &)
  fi

  if has_service gobble-front.service; then
    sudo systemctl restart gobble-front.service
  else
    stop_port 3000
    (cd "$LIVE" && nohup npx serve -s dist -l 3000 > "$HOME/front.log" 2>&1 &)
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local delay="${4:-0.5}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent --show-error --max-time 2 "$url" >/dev/null 2>&1; then
      echo "OK: $label repond ($url)"
      return 0
    fi
    sleep "$delay"
  done
  echo "ERREUR: $label ne repond pas ($url)" >&2
  return 1
}

check_services() {
  wait_for_http "http://127.0.0.1:4000/health" "backend Gobble" && \
  wait_for_http "http://127.0.0.1:3000/" "frontend Gobble"
}

restart_old_after_build_failure() {
  echo "=== Build echoue: redemarrage de l'ancienne version ===" >&2
  if [ -d "$LIVE" ]; then
    start_services || true
    check_services || true
  fi
}

rollback() {
  echo "=== Rollback vers gobble_backup ==="
  if [ ! -d "$BACKUP" ]; then
    echo "ERREUR: aucune sauvegarde $BACKUP disponible." >&2
    exit 1
  fi

  stop_services
  rm -rf "$FAILED"
  if [ -d "$LIVE" ]; then
    mv "$LIVE" "$FAILED"
  fi
  mv "$BACKUP" "$LIVE"

  if start_services && check_services; then
    echo "=== ROLLBACK OK ==="
    echo "La version retiree est conservee dans $FAILED"
    exit 0
  fi

  echo "ERREUR CRITIQUE: l'ancienne version ne redemarre pas correctement." >&2
  exit 1
}

if [ "${1:-}" = "--rollback" ]; then
  rollback
fi

if [ ! -f "$UPLOAD" ]; then
  echo "ERREUR: archive $UPLOAD introuvable." >&2
  exit 1
fi
if [ ! -x "$BUILDER" ]; then
  chmod +x "$BUILDER" 2>/dev/null || true
fi
if [ ! -f "$BUILDER" ]; then
  echo "ERREUR: builder $BUILDER introuvable." >&2
  exit 1
fi

rm -rf "$INCOMING"
mkdir -p "$INCOMING/server"

# On recupere uniquement ce qui doit survivre a un deploiement.
# L'archive locale viendra ensuite ecraser le code, mais pas les donnees runtime exclues.
if [ -d "$LIVE/dist" ]; then
  cp -a "$LIVE/dist" "$INCOMING/dist"
fi
if [ -d "$LIVE/data" ]; then
  cp -a "$LIVE/data" "$INCOMING/data"
fi
if [ -d "$LIVE/server/data" ]; then
  cp -a "$LIVE/server/data" "$INCOMING/server/data"
fi
if [ -e "$LIVE/server/data-runtime" ]; then
  cp -a "$LIVE/server/data-runtime" "$INCOMING/server/data-runtime"
fi

# Conserver les fichiers d'environnement de la VM, jamais ceux du PC.
for rel in .env .env.local .env.production server/.env server/.env.local server/.env.production; do
  if [ -f "$LIVE/$rel" ]; then
    mkdir -p "$INCOMING/$(dirname "$rel")"
    cp -a "$LIVE/$rel" "$INCOMING/$rel"
  fi
done

echo "=== Extraction de la version envoyee ==="
tar -xzf "$UPLOAD" -C "$INCOMING"
rm -f "$UPLOAD"

# On restaure les .env de la VM apres extraction par precaution.
for rel in .env .env.local .env.production server/.env server/.env.local server/.env.production; do
  if [ -f "$LIVE/$rel" ]; then
    mkdir -p "$INCOMING/$(dirname "$rel")"
    cp -a "$LIVE/$rel" "$INCOMING/$rel"
  fi
done

# Comme dans l'ancien script: on libere la RAM avant npm ci / build.
stop_services

if ! REPO_DIR="$INCOMING" bash "$BUILDER"; then
  restart_old_after_build_failure
  echo "ERREUR: build de la nouvelle version echoue. Aucune bascule effectuee." >&2
  exit 1
fi

echo "=== Bascule vers la nouvelle version ==="
# Garder les metadonnees Git de la VM pour le prochain deploy.bat incremental.
# Le code envoye reste celui de l'archive, sans utiliser Git pour ce deploiement.
if [ -d "$LIVE/.git" ]; then
  cp -a "$LIVE/.git" "$INCOMING/.git"
fi
rm -rf "$BACKUP"
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$BACKUP"
fi
mv "$INCOMING" "$LIVE"

if start_services && check_services; then
  echo "=== DEPLOIEMENT OK ==="
  echo "Backup precedent: $BACKUP"
  echo "Logs: $HOME/front.log / $HOME/server.log"
  ss -lntp | egrep '(:3000|:4000)\b' || true
  exit 0
fi

echo "ERREUR: nouvelle version construite mais non fonctionnelle. Rollback automatique." >&2
rollback
