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
- **Whiteboards** at `/board-live`: each board (`/boards/[id]`, table `boards`) has a `BoardRoom` Durable
  Object that holds its drawing (every shape, keyed by id) and everyone who has it open. Browsers draw with
  Excalidraw (`src/components/boards/BoardCanvas.tsx`) and send the shapes they changed; the room keeps
  the newest version of each shape and passes changes and live cursors on. Viewers' edits are ignored.
  Access (owner, people it's shared with as editor or viewer, and optional "anyone with the link") is
  checked by `/api/boards/[id]/ticket`, which hands out one-time tickets; changing someone's access
  disconnects them so they rejoin with their new rights. Pictures are uploaded like other files and
  shared as links (the R2 CORS policy in step 3 must allow GET, or boards can show pictures but not
  include them in exported images). Excalidraw's fonts are copied into `public/excalidraw-assets` at build time
  (`scripts/copy-excalidraw-assets.mjs`, git-ignored) because the CSP blocks its CDN.
- **Error monitoring** (`src/server/errors.ts`): browsers report crashes to `/api/errors` and the platform
  API records its 500s. Problems are grouped (ids, numbers and build hashes ignored); the daily job asks
  Gemini to diagnose new ones and emails a digest to `SUPER_ADMIN_EMAILS`. Review them in /console → Errors
  (resolve, ignore; a resolved problem reopens if it happens again). Nothing is fixed in code automatically.
  Pages broken by a new deploy (missing code chunk) reload themselves once.
- **Help assistant**: common "how do I…" questions are answered on the device from `src/lib/help/knowledge.ts`
  (instant, works offline); other questions go to Gemini, and answers are kept on the device for offline repeats.
  Update the answers there when features change.
- **Daily job** (`triggers.crons`, 08:00 UTC): quiz reminders, run through `src/app/api/cron/daily/route.ts`.
  Test locally with `npx wrangler dev --test-scheduled` and `curl "http://localhost:8787/__scheduled?cron=0+8+*+*+*"`.

The Durable Objects are created by **production** deploys (the `migrations` block in `wrangler.jsonc`:
`v1` RealtimeHub, `v2` BoardRoom). Preview builds (`opennextjs-cloudflare upload`) can't create them, so a
preview build of a branch that adds one fails until that change has been deployed from `main` once.

## Security

- **Rate limits** (`ratelimits` in `wrangler.jsonc`, enforced in `cloudflare/worker.ts` before a request
  reaches the app): 300 API calls a minute per signed-in user, 1,500 a minute per IP address, and
  20 a minute per user for AI, uploads and support emails. Stripe's webhook is exempt.
- **Demo login** (`DEMO_LOGIN_ENABLED`): leave it off for a real school. When it's on, the demo admin
  is read-only. Admin → Settings → Security shows whether it's on.
- **Staff accounts need approval.** Picking "teacher" or "NGO representative" when signing up (or applying
  from Settings) creates an application (`role_applications`, `src/server/modules/applications.ts`); the
  account keeps student permissions until an admin approves it in Admin → Approvals. Admins can also
  ask for more information or decline with a reason; applicants see every step at `/application` and
  can reapply 7 days after a decline. People an admin invites (Users → Invite) with a role get it as
  soon as they sign up with that email address, once it's verified.
- **Owner console** (`/console`, `src/server/modules/owner.ts`): for the platform owner only. Set the secret
  `SUPER_ADMIN_EMAILS` (comma separated) in Cloudflare → universe-web → Settings → Variables and secrets.
  An account becomes owner only when it signs in with Google (verified email) as one of those addresses;
  demo logins never do. Everyone else gets "not found" for the page and its API. The owner can see
  every account, all linked records, private conversations and calls, sign-ins and actions, and edit or
  delete any record; every change is kept in `owner_changes` and can be undone. Other admins can't
  suspend or delete the owner account. `src/server/owner-schema.json` (table descriptions for the
  editor) is regenerated from the schema by `pnpm build`.
- **Permissions** are checked on the server for every change (course teacher, author or admin); the
  shared checks live in `src/server/access.ts`.
- **Pricing is not public.** Plans are shown to organization admins in Admin → Billing & Plans. Plans
  marked `contactSales` in `src/lib/plans.ts` (Enterprise) can't be bought online: "Contact us" sends a
  high-priority "Platform sales" support ticket (and email, tagged `[SALES]`) to the UniVerse team.
- **Uploads** only accept documents, images, audio and video (`uploadMime` in `src/lib/storage.ts`).
- User-supplied links are rendered through `safeHref` (`src/lib/safe-href.ts`).

## Notes

- The Worker is about 3.4 MB gzipped (minified). The Workers free plan allows 3 MB, the paid plan ($5/month) 10 MB.
