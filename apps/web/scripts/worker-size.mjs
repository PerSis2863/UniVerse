// M110: the size alarm (the council, 5 Nov 2026). Cloudflare refuses a Worker whose code is over
// 64 MiB (uncompressed, since Sept 2026) and stops a build at 20 minutes; nothing warned before
// either wall. This measures the server code the next deploy uploads, in a few seconds, and says
// plainly how close both walls are: a warning past 55 MiB, a stop past 60 MiB (so 4 MiB of room is
// left to make it smaller), a warning past 16 build minutes.
//
// Runs before every `wrangler deploy` and `wrangler dev` (wrangler.jsonc "build"), and at the end of
// `pnpm local:build` (--strict). On Cloudflare (WORKERS_CI) a size past 60 MiB stops the deploy, so
// the live site keeps its last good version; the build variable SIZE_ALARM_OFF=1 lets one through.
// Anywhere else it only warns, unless --strict. It never fails a deploy because it couldn't measure.
//
// How it measures without a second full bundle (that takes over a minute, and builds are already
// close to 20): esbuild bundles our own entry (cloudflare/worker.ts) as wrangler does (minified,
// names kept, production) with Next's server handler left out, then adds the handler's file size and
// the WebAssembly modules. On 5 Nov 2026 it said 49.0 MiB where `wrangler deploy --dry-run` said
// 48.3 MiB (wrangler shrinks the already-minified handler a little more), so it errs a little high:
// the safe side. The exact number: `npx wrangler deploy --dry-run` ("Total Upload").
// It also adds the numbers to .open-next/assets/build-size.json for the console's Health numbers.
import { builtinModules, createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MiB = 1024 * 1024;
export const LIMIT = 64 * MiB;
export const WARN = 55 * MiB;
export const STOP = 60 * MiB;
export const BUILD_LIMIT_MIN = 20;
export const BUILD_WARN_MIN = 16;
const HANDLER = '.open-next/server-functions/default/apps/web/handler.mjs';
/** Written by the build's first step (scripts/build-budget.mjs). */
export const START_FILE = 'node_modules/.cache/universe-build-start.json';
const SUMMARY = '.open-next/assets/build-size.json';

const mb = (bytes) => (bytes / MiB).toFixed(1);

/** The plain-words verdict for the server code's size and the build's minutes so far.
 *  `level` decides: 'ok', 'warn' (past 55 MiB) or 'stop' (past 60 MiB).
 *  @param {number} bytes
 *  @param {number | null} [minutes] null or left out when unknown */
export function verdict(bytes, minutes = null) {
  const level = bytes >= STOP ? 'stop' : bytes >= WARN ? 'warn' : 'ok';
  const lines = [`Server code: ${mb(bytes)} of 64 MB (Cloudflare refuses anything bigger).`];
  if (level === 'stop') lines.push('✖ Too big to deploy safely: past 60 MB. Make the server code smaller first (the M110 note in STAGE-5-HANDOFF.md says how).');
  else if (level === 'warn') lines.push('▲ Getting close: past 55 MB. Make the server code smaller soon (the M110 note in STAGE-5-HANDOFF.md says how).');
  const slow = minutes !== null && minutes >= BUILD_WARN_MIN;
  if (minutes !== null) lines.push(`Build: ${minutes.toFixed(1)} minutes so far (Cloudflare stops a build at ${BUILD_LIMIT_MIN}).${slow ? ' ▲ Close to the limit.' : ''}`);
  return { level, slow, lines };
}

/** Bytes the next deploy uploads (see the header for how, and how close it is). */
export async function measure(cwd = process.cwd()) {
  const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler', { paths: [cwd] }));
  const { build } = fromWrangler('esbuild');
  const result = await build({
    entryPoints: ['cloudflare/worker.ts'], absWorkingDir: cwd, bundle: true, write: false, outdir: '.open-next/.size',
    format: 'esm', target: 'es2022', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'], mainFields: ['browser', 'module', 'main'],
    minify: true, keepNames: true, define: { 'process.env.NODE_ENV': '"production"' },
    external: ['cloudflare:*', 'node:*', ...builtinModules, '*server-functions/default/handler.mjs', '*apps/web/handler.mjs'],
    loader: { '.wasm': 'copy', '.bin': 'copy' }, logLevel: 'silent',
  });
  // Wrangler uploads each module once (WebAssembly is named by its hash), so count each content once.
  const seen = new Set();
  let bytes = statSync(join(cwd, HANDLER)).size;
  for (const file of result.outputFiles) {
    const hash = createHash('sha1').update(file.contents).digest('hex');
    if (!seen.has(hash)) { seen.add(hash); bytes += file.contents.length; }
  }
  return bytes;
}

function buildMinutes() {
  try {
    const { at } = JSON.parse(readFileSync(START_FILE, 'utf8'));
    const minutes = (Date.now() - at) / 60_000;
    return minutes >= 0 && minutes < 180 ? minutes : null;
  } catch { return null; }
}

async function main() {
  const strict = process.argv.includes('--strict');
  const ci = !!process.env.WORKERS_CI;
  if (!existsSync(HANDLER)) { console.log('Size alarm: nothing built yet (it measures after an OpenNext build).'); return; }
  let bytes;
  try { bytes = await measure(); } catch (e) { console.warn(`Size alarm: couldn't measure (${e instanceof Error ? e.message : e}); carrying on.`); return; }
  // Minutes only mean something inside a build (wrangler dev may start hours after one).
  const minutes = ci || strict ? buildMinutes() : null;
  const { level, lines } = verdict(bytes, minutes);
  for (const line of lines) (level === 'ok' ? console.log : console.warn)(line);
  try {
    if (existsSync(SUMMARY)) {
      const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
      writeFileSync(SUMMARY, JSON.stringify({ ...summary, server: { bytes, limit: LIMIT, warn: WARN }, ...(minutes === null ? {} : { minutes: Math.round(minutes * 10) / 10 }) }));
    }
  } catch { /* the console just won't show it: never a reason to stop a deploy */ }
  if (level === 'stop' && (ci || strict) && !process.env.SIZE_ALARM_OFF) {
    console.error('Stopped here, so the live site keeps its last good version. To deploy this one anyway, set the build variable SIZE_ALARM_OFF=1 once.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
