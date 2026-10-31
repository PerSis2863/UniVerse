// Copies a STORMFALL web build (Unity: Tools → Build Stormfall for Web) into public/games/stormfall.
//   node scripts/stormfall-web.mjs <unity build folder>
// Unity's loader normally runs the game's main script from a blob: address, which this site's
// Content-Security-Policy refuses (script-src has no blob:). So this unpacks that one script to a
// plain .js file and points the loader at it: it then loads like any other script of this site,
// and the policy stays as it is. The data and code files stay Brotli-packed; the loader unpacks
// them in a worker (worker-src allows blob:) and compiles the code ('wasm-unsafe-eval' is allowed).
import { brotliDecompressSync } from 'node:zlib';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const from = process.argv[2] && join(resolve(process.argv[2]), 'Build');
if (!from || !existsSync(from)) { console.error('Usage: node scripts/stormfall-web.mjs <unity build folder>'); process.exit(1); }
const out = fileURLToPath(new URL('../public/games/stormfall/', import.meta.url));
const find = (end) => { const f = readdirSync(from).find((n) => n.endsWith(end)); if (!f) throw new Error(`No *${end} in ${from}`); return join(from, f); };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(find('.data.unityweb'), join(out, 'stormfall.data.unityweb'));
copyFileSync(find('.wasm.unityweb'), join(out, 'stormfall.wasm.unityweb'));
writeFileSync(join(out, 'stormfall.framework.js'), brotliDecompressSync(readFileSync(find('.framework.js.unityweb'))));

// The one change to Unity's loader: load frameworkUrl as a plain script instead of fetching it into a blob.
const BLOB = 'N(w.frameworkUrl).then(function(e){var s=URL.createObjectURL(new Blob([e],{type:"application/javascript"}));';
let loader = readFileSync(find('.loader.js'), 'utf8');
if (!loader.includes(BLOB)) throw new Error('Unity loader changed: update the patch in scripts/stormfall-web.mjs');
loader = loader.replace(BLOB, 'Promise.resolve().then(function(){var s=w.frameworkUrl;');
writeFileSync(join(out, 'stormfall.loader.js'), loader);

const MAX = 25 * 1024 * 1024; // Cloudflare's limit per file
for (const f of readdirSync(out)) {
  const size = statSync(join(out, f)).size;
  if (size > MAX) throw new Error(`${f} is ${(size / 1048576).toFixed(1)} MB, over Cloudflare's 25 MB limit`);
  console.log(`${f}  ${(size / 1048576).toFixed(2)} MB`);
}
