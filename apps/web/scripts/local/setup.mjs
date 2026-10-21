// First time on a computer, and after pulling new work: the database client, the local database
// (every update in prisma/migrations, with the sample accounts and courses), and the generated lists.
// Run from apps/web after `pnpm install`:  pnpm local:setup
import { run } from './run.mjs';

run('npx', ['prisma', 'generate'], { env: { PRISMA_GENERATE_SKIP_AUTOINSTALL: '1' } });
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'universe-db', '--local']);
// Local test teachers for the checks (scripts/checks): Tara (co-teacher) and Tom (TA) on CS101.
run('node', ['scripts/local/test-accounts.mjs']);
run('node', ['scripts/gen-owner-schema.mjs']);
run('node', ['scripts/gen-api-routes.mjs']);
console.log('\n✔ Ready. Next: pnpm local:build, then pnpm local:serve (see START-HERE.md).');
