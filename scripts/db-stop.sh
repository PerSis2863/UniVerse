#!/bin/bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew services stop postgresql@16
echo "✅ Local database stopped (saves memory/battery)."
