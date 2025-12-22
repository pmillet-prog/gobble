#!/bin/bash

echo "Stopping old server..."
pkill -f "node index.js" || true
sleep 1

echo "Starting server..."
cd /home/freebox/gobble/server || exit 1
NODE_ENV=production nohup node index.js > ../server.log 2>&1 &

echo "Server started"
