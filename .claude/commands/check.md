---
description: Run UniVerse's checks (types, lint, unit tests, route tables) and show only what failed
argument-hint: "[quick|full]"
---

Run the project's own checks from `apps/web`, in this order, and report **only failures** (file:line
and the message), never the passing output. Mode: `$ARGUMENTS` (default `full`).

1. Route tables: `node scripts/gen-api-routes.mjs --check` (if it fails, run it without `--check`:
   a route or page was added or removed).
2. Types: `pnpm typecheck` (both tsconfigs; the deploy build skips type checking, so this is the only one).
3. Lint, changed and new files only:
   `npx eslint $( { git diff --name-only --relative --diff-filter=d HEAD -- src cloudflare scripts; git ls-files -o --exclude-standard -- src cloudflare scripts; } | grep -E '\.(ts|tsx|mjs|js)$')`
   (0 errors required; don't silence rules with disable comments).
4. `quick` stops here. `full`: unit tests `npx vitest run`.
5. Secrets and names: confirm the diff has no keys or tokens and no AI model names or ids
   (`git diff HEAD`).

End with one line: `CHECKS: PASS` or `CHECKS: FAIL (n)`, then the failures. Don't fix anything
unless asked (use `/fix-checks`).
