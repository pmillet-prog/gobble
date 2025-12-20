#!/usr/bin/env bash
set -euo pipefail

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
