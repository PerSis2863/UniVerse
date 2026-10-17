// Builds the site exactly as Cloudflare does (OpenNext), with the demo sign-in button shown, then
// puts back the files the build rewrites (the service worker files, and the public settings in
// cloudflare/next-public.gen.ts, which stay empty in the project: never commit them changed).
// Takes 10–15 minutes. Run from apps/web:  pnpm local:build
import { run } from './run.mjs';

const ok = run('npx', ['opennextjs-cloudflare', 'build'], { env: { NEXT_PUBLIC_DEMO_LOGIN: 'true' }, ok: true });
run('git', ['checkout', '--', 'public/sw.js', 'public/fallback-*.js', 'public/workbox-*.js', 'cloudflare/next-public.gen.ts'], { ok: true });
if (!ok) { console.error('\n✖ The build failed: the error is above.'); process.exit(1); }
console.log('\n✔ Built. Next: pnpm local:serve');
