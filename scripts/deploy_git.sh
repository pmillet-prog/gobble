#!/usr/bin/env bash
set -euo pipefail

# Recu sur stdin via SSH: fonctionne aussi apres un deploy sans dossier .git.
REPO_DIR="$HOME/gobble_git"
REMOTE_URL="${1:-https://github.com/pmillet-prog/gobble.git}"
export GIT_TERMINAL_PROMPT=0

if [ ! -d "$REPO_DIR" ]; then
  echo "ERREUR: dossier de production $REPO_DIR introuvable." >&2
  exit 1
fi
cd "$REPO_DIR"

if [ ! -e .git ]; then
  echo "=== Reinitialisation Git apres le deploiement par archive ==="
  git init
  git remote add origin "$REMOTE_URL"
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
fi

echo "=== Recuperation de origin/main ==="
git -c http.version=HTTP/1.1 fetch --depth=1 origin +refs/heads/main:refs/remotes/origin/main

# Ce fichier historique est suivi par Git. Sauver sa valeur VM avant reset.
RUNTIME_DIR="$HOME/gobble_runtime"
mkdir -p "$RUNTIME_DIR"
if [ -f data/playtime-limits.json ] && [ ! -L data/playtime-limits.json ] && [ ! -e "$RUNTIME_DIR/playtime-limits.json" ]; then
  cp -p data/playtime-limits.json "$RUNTIME_DIR/playtime-limits.json"
fi

# Pas de git clean: les .env, bases et autres donnees locales doivent survivre.
git reset --hard origin/main
bash scripts/vm_update.sh
