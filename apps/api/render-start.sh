#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

echo "Pushing database schema..."
npx prisma db push --accept-data-loss

echo "Seeding database..."
npx tsx prisma/seed.ts

echo "Starting server..."
node dist/src/main.js
