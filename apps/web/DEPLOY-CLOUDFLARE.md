# Deploying the web app to Cloudflare

The web app (`apps/web`) runs on **Cloudflare Workers** via [OpenNext](https://opennext.js.org/cloudflare).
Uploaded files live in **Cloudflare R2**. The NestJS API (`apps/api`) stays on Render; nothing about it changes.

| What | Before (Vercel) | Now (Cloudflare) |
|---|---|---|
| Hosting | Vercel | Cloudflare Workers (`wrangler.jsonc`, `open-next.config.ts`) |
| File uploads | Vercel Blob | R2 bucket served from `NEXT_PUBLIC_FILES_URL` (`src/lib/r2.ts`) |
| Database | Prisma, native engine | Prisma WebAssembly engine + `pg` driver adapter on Workers (`src/lib/db.ts`) |
| Security headers | `src/proxy.ts` (middleware) | `headers()` in `next.config.ts` (`security-headers.ts`) |
| Analytics | `@vercel/analytics` | Cloudflare Web Analytics (turn on in the dashboard; no code) |
| Images | Vercel image optimizer | Served as-is (`images.unoptimized`) |

Files uploaded before the move stay in Vercel Blob and keep working: those URLs are still accepted
and allowed by the CSP. Keep the Vercel Blob store until those files are copied to R2.

## One-time setup (Cloudflare dashboard)

1. **Domain.** Buy or transfer the domain in Cloudflare (Domain Registration). It's then a zone in your account.
2. **R2 bucket for uploads.** R2 → Create bucket, e.g. `universe-files`.
   - Settings → **Custom Domains** → connect `files.universeimpact.com`. This is `NEXT_PUBLIC_FILES_URL`.
   - Settings → **CORS policy**, so browsers can upload chat files over 4 MB straight to R2:
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
   - R2 → **Manage API tokens** → create a token with *Object Read & Write* on this bucket.
     This gives `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Your account ID is on the R2 overview page.
3. **Create the Worker from GitHub.** Workers & Pages → Create → Import a repository → this repo:
   - Root directory: `/` (repo root, because pnpm installs the workspace from there)
   - Build command: `pnpm install --frozen-lockfile && cd apps/web && npx opennextjs-cloudflare build`
   - Deploy command: `cd apps/web && npx opennextjs-cloudflare deploy`
   - Production branch: `main`. Builds on `main` also apply additive schema changes to the database (`scripts/db-sync.mjs`).
4. **Variables.** Add these in the Worker's settings. **Build variables** are baked into the page at build time.
   **Runtime secrets** are read by the server on each request.

   Build variables (Settings → Build → Variables and secrets):
   - `NEXT_PUBLIC_API_URL`: the Render API, e.g. `https://<api>.onrender.com/api`
   - `NEXT_PUBLIC_FILES_URL`: `https://files.universeimpact.com`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`,
     `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`,
     `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_DEMO_LOGIN` (whichever you use today)
   - `DATABASE_URL`: needed at build time for the schema sync on `main`

   Runtime secrets (Settings → Variables and secrets → type *Secret*), or `npx wrangler secret put NAME` from `apps/web`:
   - `DATABASE_URL`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
   - `NEXT_PUBLIC_FILES_URL` (also read by the server)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `GEMINI_API_KEY`, optionally `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`
   - `RESEND_API_KEY`, `RESEND_FROM`, `SUPPORT_INBOX_EMAIL`

   Copy the values from Vercel → Project → Settings → Environment Variables.
5. **Custom domain for the app.** Worker → Settings → Domains & Routes → add `universeimpact.com` and `www.universeimpact.com`.
6. **Outside Cloudflare**, add the new domain:
   - Firebase console → Authentication → Settings → **Authorized domains**
   - Google Cloud console → OAuth client → authorized origins / redirect URIs
   - Stripe → Webhooks → endpoint `https://universeimpact.com/api/webhooks/stripe` (new signing secret → `STRIPE_WEBHOOK_SECRET`)
   - The Render API's CORS allow-list, if it has one
7. **Analytics** (optional). Worker → Settings → turn on Web Analytics.

When the Cloudflare deployment works on the new domain, remove the project from Vercel. Keep the
Vercel **Blob store** until its files are copied to R2.

## Local commands (from `apps/web`)

- `pnpm dev`: Next dev server, as before
- `pnpm preview`: build and run the Worker locally in the real Workers runtime. Put secrets in `.dev.vars` (git-ignored).
- `pnpm deploy`: build and deploy from your machine (after `npx wrangler login`)

## Notes

- The Worker bundle is about 2.5 MB gzipped. The Workers **free** plan allows 3 MB, the paid plan ($5/month) 10 MB.
  If the free-plan limit is hit as the app grows, switch to the paid plan.
- Each request opens its own database connection. If database latency becomes an issue, Cloudflare
  **Hyperdrive** can be added later to pool connections.
