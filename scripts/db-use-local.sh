#!/bin/bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL="postgresql://universe_user:universe_pass@localhost:5432/universe_local"
sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"$LOCAL\"|" "$ROOT/apps/api/.env"
echo "✅ Switched to LOCAL database. Start DB: ./scripts/db-start.sh"
