#!/bin/bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew services start postgresql@16
echo "✅ Local database started!"
echo "   Run 'npm run dev' in apps/api to start the backend."
