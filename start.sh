#!/bin/bash

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files gobble-back.service --no-legend 2>/dev/null | grep -q '^gobble-back.service'; then
  echo "Restarting Gobble services via systemd..."
  sudo systemctl restart gobble-back.service gobble-front.service
  echo "Done."
  exit 0
fi

echo "Stopping old servers..."
pkill -f "node index.js" || true
pkill -f "serve -s dist" || true
sleep 1

echo "Starting backend..."
cd /home/freebox/gobble_git/server || exit 1
NODE_ENV=production nohup node index.js > ../server.log 2>&1 &

echo "Starting frontend..."
cd /home/freebox/gobble_git || exit 1
nohup npx serve -s dist -l 3000 > front.log 2>&1 &

echo "Done."
