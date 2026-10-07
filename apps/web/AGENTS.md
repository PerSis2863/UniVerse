<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Checks before every commit

- `pnpm typecheck` (both tsconfigs).
- `pnpm lint` must report **0 errors** (it did from October 2026; keep warnings under 50). For a
  quick check, lint only the files you changed: `npx eslint <files>`.
- Fix lint errors properly (real types, no setState inside effects, no `Date.now()` while
  rendering: see `src/lib/use-now.ts`); don't silence rules with disable comments.
- Request data on the server is untrusted: read `ctx.body` / `ctx.query` through `src/server/body.ts`
  (`oneOf`, `str`, `text`, `strings`, `first`) and pass Prisma only `pick<Prisma.XInput>(body, keys)`.
