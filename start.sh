#!/bin/bash
# start.sh

echo "Starting Next.js Frontend on port 3000..."
cd /app/infynd-ai-studio-frontend
npm run start &  # The '&' runs this in the background

echo "Starting Python Backend on port 8000..."
cd /app/infynd-ai-studio-backend
# Replace 'main.py' with whatever command actually starts your Python server!
./run.sh