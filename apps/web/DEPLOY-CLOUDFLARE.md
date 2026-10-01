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
     The same key signs Open Badges (skills passport) and verified impact reports. Keep it: badges and
     reports signed with it stop verifying if it changes.
   - `SESSION_SECRET`: a random string of 32+ characters, needed for sign-in from an LMS (LTI 1.3). Generate
     one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs
     out everyone who came in from their LMS (they just open UniVerse from the course again).
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

## Staying on the free plan (100,000 Worker requests a day)

Only requests that run the Worker count: pages, API calls, live-update connections. Pictures, code, fonts
and other files in `public/` are served free by Cloudflare and never count. Measured on a local build:
a visitor reading the home page costs 1 request, opening the dashboard 3 (the page, one startup bundle,
the live-updates connection), each page opened from the menu ~2 (the page and its data), and an open tab
that nobody is using costs nothing. A student who signs in and opens 20 pages uses about 40–45 requests,
so the free plan covers roughly 2,000–2,500 active people a day. Beyond that, upgrade to Workers
Paid ($5/month, 10 million requests a month included).

What keeps the count low (don't undo these without measuring): the app asks for everything its first
screen needs in one request (`/api/bootstrap`, `src/lib/bootstrap.ts`), the offline page is a static file
(`public/offline.html`), the service worker doesn't download the home page a second time
(`cacheStartUrl` / `dynamicStartUrl` off in `next.config.ts`), links don't prefetch
(`src/components/ui/Link.tsx`), the service worker saves pages as they load instead of fetching them again
(`next.config.ts`), polling stops while live updates are connected and in idle tabs
(`src/lib/realtime-client.ts`), reconnects back off and give up after repeated failures, and robots.txt keeps
crawlers out of the app.

**Block bots before they reach the Worker** (blocked requests don't count). In the Cloudflare dashboard, open
the universeimpact.com zone:

1. **Security → Bots:** turn on **Block AI bots**. Leave *Bot Fight Mode* off: on the free plan it can't be
   bypassed for Stripe's payment webhooks.
2. **Security → WAF → Custom rules → Create rule** (the free plan allows 5):
   - *Block scanners*, action **Block**, expression:
     ```
     (http.request.uri.path contains ".php") or (http.request.uri.path contains "/wp-") or
     (starts_with(http.request.uri.path, "/.env")) or (starts_with(http.request.uri.path, "/.git")) or
     (http.request.uri.path contains "/cgi-bin") or (http.request.uri.path contains "phpmyadmin") or
     (http.request.uri.path contains "xmlrpc") or (http.request.uri.path contains "/actuator") or
     (http.request.uri.path contains ".asp")
     ```
   - *Block empty user agents*, action **Block**, expression:
     `(http.user_agent eq "") and not starts_with(http.request.uri.path, "/api/webhooks/")`
3. **Security → WAF → Rate limiting rules** (1 free rule): *API floods*: when
   `starts_with(http.request.uri.path, "/api/")`, count by IP, **300 requests per 10 seconds**, action **Block**
   for 10 seconds. (Generous because a whole campus can share one IP address.)
4. **Security → Settings:** keep **Browser Integrity Check** on.
5. Check the effect in **Security → Events** (what was blocked) and **Workers & Pages → universe-web → Metrics**.

## On Workers Paid ($5/month): the spending guard

Cloudflare has no setting that caps the bill: past what the $5 includes (10 million requests and 30 million
CPU ms a month, plus D1, Durable Objects, logs and R2 allowances), usage is charged. Three things keep it at $5:

- **The spending guard** (`cloudflare/usage-guard.ts`), every 15 minutes: reads this billing month's usage
  from Cloudflare's analytics, emails `SUPER_ADMIN_EMAILS` at 70% of any allowance, and at 90% pauses the app
  (every page and API call gets a small "back soon" answer; Stripe's webhook still works) until the next
  billing month. The owner console's Overview shows the usage. Secrets (type **Secret**):
  - `CF_ACCOUNT_ID`: the account id (Workers & Pages → Overview, right-hand side).
  - `CF_USAGE_TOKEN`: My Profile → API Tokens → Create Token → Custom token, permission
    **Account → Account Analytics → Read**, nothing else.
  - `CF_BILLING_DAY`: the day of the month the Paid plan renews (the day it was bought). Without it the guard
    counts the last 31 days, which may pause early.
  - `CF_GUARD_OFF`: any value turns pausing off (to reopen during a pause and accept extra charges).
- **A 50 ms CPU limit per request**: after upgrading, add `"limits": { "cpu_ms": 50 }` to `wrangler.jsonc`
  (Paid plan only: the free plan is fixed at 10 ms and refuses the setting), so no single request can run
  up time.
- The bot and rate-limiting rules above: requests blocked by Cloudflare's firewall never reach the Worker
  and aren't billed. A paused app still counts each request it answers, though cheaply.

## Owner console → Server

The owner can switch UniVerse between **Live**, **Read-only** (people can look around; every change is
refused with a message) and **Maintenance** (everyone else sees a "down for maintenance" page), with an
optional message and a time to go back to Live by itself, and show a notice at the top of every page. The
switch is the `server_control` row; the Worker (`cloudflare/usage-guard.ts`) applies it within a minute.
Stripe's webhook always goes through, and so does the owner: opening the console gives their browser a
`uv_owner` cookie (on a new device: sign in at /login, then open any page).

**Feature switches** turn one feature off for everyone (sending messages, calls, uploads, AI, groups,
whiteboards, sign-ups, payments). They are stored in `server_control.switches`. The list and the
paths each one blocks are in `src/lib/feature-switches.ts`; the Worker refuses those paths, and the
chat send route checks calls itself. **Watch words** (`server_control.watchWords`, owner console → Live
chats) send the owner an in-app alert when one is written in a chat. A person can be **muted in chat**
(`users.chatMutedUntil`): they can still read their chats but can't send. Migration
0023 adds these columns.

## Notes

- The Worker is about 3.4 MB gzipped (minified). Cloudflare's documented script limit is 3 MB on the free plan and 10 MB on paid; deployments have been succeeding, but if one fails with a size error, that's the cause.

## Features that need a key or setup

| Feature | Needs |
| --- | --- |
| Chat translation, AI tutor (answers, practice questions, flashcards, reading course PDFs), AI diagnosis of errors | `GEMINI_API_KEY`. Without it these show “isn’t set up yet” and everything else works. |
| Open Badges downloads, verified impact reports | `CREDENTIAL_SIGNING_PRIVATE_KEY` (same key as verified credentials) |
| Moodle / Canvas / other LMS (LTI 1.3) | `SESSION_SECRET`, then Admin → LMS integration (LTI): give the LMS the URLs shown there and register the LMS. Set the tool to open in a new window: UniVerse refuses to be framed by other sites. Only resource-link launches (single sign-on + course linking + enrolment) are supported for now; grade passback and deep linking aren’t. |
| Early warning | Nothing: runs in the daily job (08:00 UTC) and on “Check now”. |
| Low-data mode | Nothing: a per-device setting (Settings, Ctrl+K, or offered on slow connections). |

Europass / European Digital Credentials: issuing EDC-format credentials requires a qualified electronic seal
from a trust service provider, which can’t be done in code. The skills passport exports Open Badges 3.0,
which employers and badge platforms can verify.
