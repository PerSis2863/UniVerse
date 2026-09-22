#!/bin/bash
# ─── UniVerse API Startup with DB Auto-Failover ────────────────────────────
# Tries local PostgreSQL first, falls back to Neon if unavailable.

LOCAL_DB="postgresql://universe_user:universe_pass@localhost:5432/universe_local"
NEON_DB="${NEON_DATABASE_URL:-}"

echo "🔍 Checking local PostgreSQL..."

if pg_isready -h localhost -p 5432 -U universe_user -d universe_local -q 2>/dev/null; then
  echo "✅ Local PostgreSQL is UP → using local database"
  export DATABASE_URL="$LOCAL_DB"
else
  echo "⚠️  Local PostgreSQL is DOWN"
  if [ -n "$NEON_DB" ]; then
    echo "🔄 Falling back to Neon backup..."
    export DATABASE_URL="$NEON_DB"
    echo "✅ Using Neon as backup"
  else
    echo "❌ NEON_DATABASE_URL not set — starting with local URL anyway"
    export DATABASE_URL="$LOCAL_DB"
  fi
fi

echo "📡 DB: $(echo $DATABASE_URL | sed 's/:\/\/.*@/:\/\/*****@/')"

node dist/src/main.js
