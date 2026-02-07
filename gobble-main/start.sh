#!/bin/bash

echo "Stopping old servers..."
pkill -f "node index.js" || true
pkill -f "serve -s dist" || true
sleep 1

echo "Starting backend..."
cd /home/freebox/gobble_git/server || exit 1
NODE_ENV=production nohup node index.js > ../server.log 2>&1 &

echo "Done."
