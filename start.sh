#!/bin/bash

echo "Stopping old server..."
pkill -f "node" || true
sleep 1

echo "Starting server..."
cd /home/freebox/gobble/server
NODE_ENV=production nohup node index.js > ../server.log 2>&1 &
