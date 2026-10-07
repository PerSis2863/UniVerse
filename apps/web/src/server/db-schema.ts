// The database's shape (models with their fields, and enums) for the owner console and data
// exports, written to owner-schema.json by scripts/gen-owner-schema.mjs. Read with require() so
// TypeScript doesn't build a type for every value in the 440 KB file: typing it took the build's
// type check past the memory Cloudflare's build machine gives Node, and the production build failed
// ("JavaScript heap out of memory", Oct 2026). Each user casts `models` to the fields it needs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const dbSchema = require('./owner-schema.json') as { models: unknown[]; enums: Record<string, string[]> };
