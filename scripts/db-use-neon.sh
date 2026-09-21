#!/bin/bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp "$ROOT/apps/api/.env.neon-backup" "$ROOT/apps/api/.env"
echo "✅ Switched to NEON (cloud) database. Restart API server to apply."
