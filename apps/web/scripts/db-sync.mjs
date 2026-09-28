// Applies additive schema changes to the production database during production builds
// (Cloudflare Workers Builds on the main branch, or Vercel production).
// `prisma db push` without --accept-data-loss refuses anything destructive (the build fails
// instead), so production data is never dropped. Preview/local builds are skipped so a feature
// branch can never change the production schema.
import { execSync } from 'node:child_process';

const isProduction =
  process.env.DB_SYNC === '1' ||
  process.env.VERCEL_ENV === 'production' ||
  (process.env.WORKERS_CI === '1' && process.env.WORKERS_CI_BRANCH === 'main');
if (!isProduction) {
  console.log('[db-sync] Skipping schema sync (not a production build).');
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.log('[db-sync] DATABASE_URL not set; skipping schema sync.');
  process.exit(0);
}
console.log('[db-sync] Applying schema to the production database (non-destructive)…');
execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
