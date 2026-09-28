# Deploying UniVerse to Cloudflare

Everything runs on Cloudflare: the website and its API on **Workers** (via [OpenNext](https://opennext.js.org/cloudflare)),
the database on **D1**, uploaded files on **R2**. The old NestJS API on Render and the Neon
Postgres database have been removed.

| What | Before | Now |
|---|---|---|
| Hosting | Vercel | Cloudflare Workers (`wrangler.jsonc`, `open-next.config.ts`) |
| API | NestJS on Render | Same routes served by the web app at `/api/core/*` (`src/server`) |
| Database | Neon Postgres | Cloudflare D1 (SQLite) via Prisma's D1 adapter (`src/lib/db.ts`, `prisma/`) |
| Sign-in check | `firebase-admin` on Render | Firebase ID tokens verified with Google's public keys (`src/server/auth.ts`) |
| File uploads | Vercel Blob / Render disk | R2 bucket served from `NEXT_PUBLIC_FILES_URL` (`src/lib/r2.ts`) |
| Certificate PDF | Headless Chrome (puppeteer) | Print-ready page; the browser's "Save as PDF" makes the file |

## Database (D1)

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/*.sql`, applied in order by wrangler.
  `0002_sample_data.sql` loads the sample data (demo accounts, courses, grades, messages, ...).
- Deploys apply new migrations before publishing (see the deploy command below).
- To change the schema: edit `schema.prisma`, run `pnpm db:migrate:local`, then write the next migration with
  `npx prisma migrate diff --from-url "file:$(ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata)" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0004_<name>.sql`
  and commit it. The next deploy applies it.
- D1 has no transactions: Prisma runs grouped writes one by one.

## One-time setup (Cloudflare dashboard)

1. **Create the database.** Storage & databases → **D1 SQL Database** → **Create** → name `universe-db`.
   Its **Database ID** is in `wrangler.jsonc` (`d1_databases[0].database_id`).
2. **Deploy command.** Workers & Pages → `universe-web` → Settings → Builds → Build configuration:
   - Build command: `pnpm install --frozen-lockfile && cd apps/web && npx opennextjs-cloudflare build`
   - Deploy command: `cd apps/web && npx wrangler d1 migrations apply universe-db --remote && npx opennextjs-cloudflare deploy`
   - Version command: `cd apps/web && npx opennextjs-cloudflare upload`
3. **R2 bucket for uploads** (`universe-files`, custom domain `files.universeimpact.com`, CORS policy):
   ```json
   [
     {
       "AllowedOrigins": ["https://universeimpact.com", "https://www.universeimpact.com", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Variables.** Build variables (Settings → Builds → Variables and secrets) are baked into the pages:
   - `NEXT_PUBLIC_FILES_URL` = `https://files.universeimpact.com`
   - `NEXT_PUBLIC_FIREBASE_*` (API key, auth domain, project ID, storage bucket, sender ID, app ID, measurement ID)
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_DEMO_LOGIN` if used

   Runtime variables and secrets (Settings → Variables and secrets):
   - `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_FILES_URL`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY` (optional `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`)
   - `RESEND_API_KEY`, `RESEND_FROM`, `SUPPORT_INBOX_EMAIL` (optional). With `RESEND_API_KEY` set, people who
     have "Email notifications" on also get emails for new grades, credential decisions, chat messages they
     miss and quizzes due within 24 hours. `RESEND_FROM` must use a domain verified in Resend, e.g.
     `UniVerse <notifications@universeimpact.com>`. Optional `PUBLIC_APP_URL` (default `https://universeimpact.com`)
     sets the links in those emails.
   - `CREDENTIAL_SIGNING_PRIVATE_KEY`: Ed25519 key that signs impact credentials (optional; without it,
     issuing credentials is refused). Generate one with
     `node -e "console.log(require('crypto').generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"`
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` for push notifications (optional)
   - `CHAIN_ANCHOR_ENABLED`, `CHAIN_ANCHOR_PRIVATE_KEY`, … to anchor credentials on Polygon (optional, see `src/server/services/chain-anchor.service.ts`)
   - `DEMO_LOGIN_ENABLED=true` only if the demo accounts should be able to sign in without a password

   No longer needed: `DATABASE_URL`, `NEXT_PUBLIC_API_URL`.
5. **Domains.** Worker → Domains: `universeimpact.com` and `www.universeimpact.com`. Add both to Firebase →
   Authentication → Settings → Authorized domains, and point the Stripe webhook to
   `https://universeimpact.com/api/webhooks/stripe`.

## Local commands (from `apps/web`)

- `pnpm db:migrate:local`: create/update the local D1 (stored in `.wrangler/`)
- `pnpm dev`: Next dev server using the local D1
- `pnpm preview`: build and run the Worker locally in the real Workers runtime. Secrets go in `.dev.vars` (git-ignored).
- `pnpm db:migrate:remote`: apply migrations to the production D1
- `pnpm db:seed:local`: run `prisma/seed.ts` against the local D1
- `pnpm deploy`: build, migrate and deploy from your machine (after `npx wrangler login`)

## Worker entry, live updates and the daily job

`cloudflare/worker.ts` is the Worker's entry (`main` in `wrangler.jsonc`). It wraps the Next.js app that
OpenNext builds and adds:

- **Live updates** at `/realtime`: each signed-in user has a `RealtimeHub` Durable Object holding their
  open tabs' WebSockets. The API calls `publish()` / `publishChat()` (`src/server/realtime.ts`) after
  chat messages, reactions, polls, typing and new notifications, and the browser
  (`src/lib/realtime-client.ts`) refetches at once. While connected, pages poll far less often; without
  the connection they keep polling as before. Browsers get a one-time ticket from `/api/realtime/ticket`.
- **Daily job** (`triggers.crons`, 08:00 UTC): quiz reminders, run through `src/app/api/cron/daily/route.ts`.
  Test locally with `npx wrangler dev --test-scheduled` and `curl "http://localhost:8787/__scheduled?cron=0+8+*+*+*"`.

The Durable Object is created by the first **production** deploy (the `migrations` block in
`wrangler.jsonc`). Preview builds (`opennextjs-cloudflare upload`) can't create it, so a preview build of
a branch fails until that change has been deployed from `main` once.

## Notes

- The Worker is about 3.2 MB gzipped (minified). The Workers free plan allows 3 MB, the paid plan ($5/month) 10 MB.
