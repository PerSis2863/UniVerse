// Runs the built site on http://localhost:8787 with the local database, demo sign-in on (the demo
// and test accounts sign in without a password, here only), and the 15-minute timer reachable at
// /__scheduled?cron=*/15+*+*+*+* for testing reminders. Stop it with Ctrl+C.
//   pnpm local:serve              the site
//   pnpm local:serve --ai-placeholder   also a fake AI key, so "AI is on" checks pass (real AI
//                                       calls then fail; the tutor tests need this)
// Never put a real key here or in a file: real keys go in Cloudflare's dashboard only.
import { run } from './run.mjs';

const accounts = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com', 'alice@student.com', 'bob@student.com', 'tara@teacher.com', 'tom@teacher.com'];
const vars = ['DEMO_LOGIN_ENABLED:true', 'NEXT_PUBLIC_DEMO_LOGIN:true', `DEMO_ACCOUNT_EMAILS:${accounts.join(',')}`];
if (process.argv.includes('--ai-placeholder')) vars.push('GEMINI_API_KEY:placeholder-not-a-real-key');
console.log('Starting on http://localhost:8787 (Ctrl+C stops it).');
run('npx', ['wrangler', 'dev', '--port', '8787', '--test-scheduled', ...vars.flatMap((v) => ['--var', v])]);
