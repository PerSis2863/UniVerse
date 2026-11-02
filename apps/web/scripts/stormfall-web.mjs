// Copies a STORMFALL web build (Unity: Tools → Build Stormfall for Web) into public/games/stormfall.
//   node scripts/stormfall-web.mjs <unity build folder>
// Unity's loader normally runs the game's main script from a blob: address, which this site's
// Content-Security-Policy refuses (script-src has no blob:). So this unpacks that one script to a
// plain .js file and points the loader at it: it then loads like any other script of this site,
// and the policy stays as it is. The data and code files stay Brotli-packed; the loader unpacks
// them in a worker (worker-src allows blob:) and compiles the code ('wasm-unsafe-eval' is allowed).
// Cloudflare serves files up to 25 MB, so a bigger data file is cut into numbered parts and the
// loader gets a small fetch hook that streams them back as the one file Unity asks for (same
// length, an ETag for Unity's download cache), with no change to the page or the policy.
import { createHash } from 'node:crypto';
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
const MAX = 25 * 1024 * 1024; // Cloudflare's limit per file
const PART = 24 * 1024 * 1024;
const data = readFileSync(find('.data.unityweb'));
const parts = [];
if (data.length <= MAX) writeFileSync(join(out, 'stormfall.data.unityweb'), data);
else for (let i = 0; i * PART < data.length; i++) {
  parts.push(`stormfall.data.${i + 1}.unityweb`);
  writeFileSync(join(out, parts[i]), data.subarray(i * PART, (i + 1) * PART));
}
copyFileSync(find('.wasm.unityweb'), join(out, 'stormfall.wasm.unityweb'));
writeFileSync(join(out, 'stormfall.framework.js'), brotliDecompressSync(readFileSync(find('.framework.js.unityweb'))));

// The one change to Unity's loader: load frameworkUrl as a plain script instead of fetching it into a blob.
const BLOB = 'N(w.frameworkUrl).then(function(e){var s=URL.createObjectURL(new Blob([e],{type:"application/javascript"}));';
let loader = readFileSync(find('.loader.js'), 'utf8');
if (!loader.includes(BLOB)) throw new Error('Unity loader changed: update the patch in scripts/stormfall-web.mjs');
loader = loader.replace(BLOB, 'Promise.resolve().then(function(){var s=w.frameworkUrl;');
if (parts.length) loader = joinParts(parts, data.length, createHash('sha256').update(data).digest('hex').slice(0, 20)) + loader;
writeFileSync(join(out, 'stormfall.loader.js'), loader);

/** The fetch hook for a split data file: GET/HEAD of stormfall.data.unityweb answered from its parts. */
function joinParts(names, length, tag) {
  return `(function(){var b=document.currentScript.src,d=new URL('stormfall.data.unityweb',b).href,p=${JSON.stringify(names)}.map(function(n){return new URL(n,b).href}),E='"${tag}"',f=window.fetch.bind(window);
window.fetch=function(u,o){var s=typeof u==='string'?u:u instanceof URL?u.href:u&&u.url;if(!s||new URL(s,location.href).href!==d)return f(u,o);
var h={'Content-Length':'${length}','Content-Type':'application/octet-stream','ETag':E};
if(new Headers(o&&o.headers).get('If-None-Match')===E)return Promise.resolve(new Response(null,{status:304,headers:{'ETag':E}}));
if(String(o&&o.method||'GET').toUpperCase()==='HEAD')return Promise.resolve(new Response(null,{status:200,headers:h}));
var i=0,r=null;function step(c){return (r?Promise.resolve(r):f(p[i]).then(function(x){if(!x.ok)throw new Error('Could not download '+p[i]+' ('+x.status+')');return r=x.body.getReader()})).then(function(g){return g.read()}).then(function(x){
if(!x.done)return c.enqueue(x.value);r=null;if(++i>=p.length)return c.close();return step(c)})}
return Promise.resolve(new Response(new ReadableStream({pull:step}),{status:200,headers:h}))}})();
`;
}

for (const f of readdirSync(out)) {
  const size = statSync(join(out, f)).size;
  if (size > MAX) throw new Error(`${f} is ${(size / 1048576).toFixed(1)} MB, over Cloudflare's 25 MB limit`);
  console.log(`${f}  ${(size / 1048576).toFixed(2)} MB`);
}
