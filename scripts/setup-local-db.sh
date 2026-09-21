#!/bin/bash
set -e

echo "================================================"
echo "  UniVerse Local Database Setup"
echo "================================================"

# 1. Install Homebrew if missing
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
fi
echo "✅ Homebrew ready"

# 2. Install PostgreSQL 16
if ! brew list postgresql@16 &>/dev/null; then
  echo "Installing PostgreSQL 16..."
  brew install postgresql@16
fi
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:$PATH"
echo "✅ PostgreSQL 16 ready"

# 3. Start PostgreSQL
brew services start postgresql@16
sleep 3

# 4. Create DB + user
createdb universe_local 2>/dev/null || echo "(database already exists)"
createuser universe_user 2>/dev/null || echo "(user already exists)"
psql -c "ALTER USER universe_user WITH ENCRYPTED PASSWORD 'universe_pass';" postgres
psql -c "GRANT ALL PRIVILEGES ON DATABASE universe_local TO universe_user;" postgres

LOCAL_DB_URL="postgresql://universe_user:universe_pass@localhost:5432/universe_local"
echo "✅ Database ready: $LOCAL_DB_URL"

# 5. Update .env
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/apps/api/.env"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_FILE.neon-backup"
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"$LOCAL_DB_URL\"|" "$ENV_FILE"
else
  echo "DATABASE_URL=\"$LOCAL_DB_URL\"" > "$ENV_FILE"
fi
echo "✅ .env updated (Neon backed up to .env.neon-backup)"

# 6. Migrate + seed
cd "$ROOT_DIR/apps/api"
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 7. Create helper scripts
cat > "$ROOT_DIR/scripts/db-start.sh" << 'EOF'
#!/bin/bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:$PATH"
brew services start postgresql@16
echo "✅ Local PostgreSQL started"
EOF

cat > "$ROOT_DIR/scripts/db-stop.sh" << 'EOF'
#!/bin/bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:$PATH"
brew services stop postgresql@16
echo "✅ Local PostgreSQL stopped"
EOF

cat > "$ROOT_DIR/scripts/db-use-neon.sh" << 'EOF'
#!/bin/bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp "$ROOT/apps/api/.env.neon-backup" "$ROOT/apps/api/.env"
echo "✅ Switched to Neon (cloud) — restart API server"
EOF

cat > "$ROOT_DIR/scripts/db-use-local.sh" << 'EOF'
#!/bin/bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:/usr/local/opt/postgresql@16/bin:$PATH"
LOCAL="postgresql://universe_user:universe_pass@localhost:5432/universe_local"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"$LOCAL\"|" "$ROOT/apps/api/.env"
echo "✅ Switched to Local — start DB then restart API: ./scripts/db-start.sh"
EOF

chmod +x "$ROOT_DIR/scripts/db-start.sh" "$ROOT_DIR/scripts/db-stop.sh" \
         "$ROOT_DIR/scripts/db-use-neon.sh" "$ROOT_DIR/scripts/db-use-local.sh"

echo ""
echo "================================================"
echo " ✅ LOCAL DATABASE SETUP COMPLETE"
echo "================================================"
echo " Start DB:     ./scripts/db-start.sh"
echo " Stop DB:      ./scripts/db-stop.sh"
echo " Use Local:    ./scripts/db-use-local.sh"
echo " Use Neon:     ./scripts/db-use-neon.sh"
echo "================================================"
