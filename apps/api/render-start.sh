#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

# Apply additive schema changes only. Without --accept-data-loss, Prisma refuses
# any change that would drop columns/tables, so production data is never wiped.
echo "Pushing database schema (non-destructive)..."
npx prisma db push --skip-generate

# Seeding is intentionally NOT run on every start (it would duplicate records).
# Run it manually when needed:  npx prisma db seed

echo "Starting server..."
node dist/src/main.js
