#!/bin/bash
cd /root/.openclaw/agents/wechat-assistant/photo-book-studio
node_modules/.bin/esbuild src/renderer.js --bundle --format=iife --outfile=src/bundle.js
