// Runs the built site on http://localhost:8787 with the local database, demo sign-in on (the demo
// and test accounts sign in without a password, here only), and the 15-minute timer reachable at
// /__scheduled?cron=*/15+*+*+*+* for testing reminders. Stop it with Ctrl+C.
//   pnpm local:serve              the site
//   pnpm local:serve --ai-placeholder   also a fake AI key, so "AI is on" checks pass (real AI
//                                       calls then fail; the tutor tests need this)
//   pnpm local:serve --payments-test    payments without a gateway: orders get made-up ids and
//                                       count as paid when confirmed (fees and donations tests)
//   pnpm local:serve --test-secret      a fresh random SESSION_SECRET for this run, so signed codes
//                                       work (event tickets and check-in codes, passkeys)
//   pnpm local:serve --owner-test       a made-up owner (owner@check.test) whose Google sign-in is
//                                       checked against a key server on this machine (port 8790,
//                                       started by scripts/checks/console-ui.mjs): the owner console
// Never put a real key here or in a file: real keys go in Cloudflare's dashboard only.
import { randomBytes } from 'node:crypto';
import { run } from './run.mjs';

const accounts = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com', 'alice@student.com', 'bob@student.com', 'tara@teacher.com', 'tom@teacher.com', 'test-parent@local.test'];
const vars = ['DEMO_LOGIN_ENABLED:true', 'NEXT_PUBLIC_DEMO_LOGIN:true', `DEMO_ACCOUNT_EMAILS:${accounts.join(',')}`];
if (process.argv.includes('--ai-placeholder')) vars.push('GEMINI_API_KEY:placeholder-not-a-real-key');
if (process.argv.includes('--payments-test')) vars.push('PAYMENTS_TEST_MODE:1');
if (process.argv.includes('--test-secret')) vars.push(`SESSION_SECRET:${randomBytes(24).toString('hex')}`);
if (process.argv.includes('--owner-test')) vars.push('SUPER_ADMIN_EMAILS:owner@check.test', 'FIREBASE_TEST_JWKS_URL:http://localhost:8790/jwks.json');
console.log('Starting on http://localhost:8787 (Ctrl+C stops it).');
run('npx', ['wrangler', 'dev', '--port', '8787', '--test-scheduled', ...vars.flatMap((v) => ['--var', v])]);
