// Puts STORMFALL's web build into public/games/stormfall before a build (58 MB: the Unity loader,
// its main script, the code and the data in parts). The files are not in main's history: they're
// downloaded from one pinned commit of the public repo (scripts/stormfall-files.json) and each is
// checked against its SHA-256 before it's kept, so a changed or broken file never ships. Files
// already in place with the right checksum are kept (a second build downloads nothing).
// If the download fails the build still goes on (the game's page then says the game couldn't be
// downloaded); `--strict` makes that an error instead.
//   node scripts/fetch-stormfall.mjs            fetch what's missing
//   node scripts/fetch-stormfall.mjs --strict   fail if any file can't be fetched
//   node scripts/fetch-stormfall.mjs --hash     print the checksums of the files in place (for a new build)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, 'stormfall-files.json'), 'utf8'));
const out = path.join(here, '..', 'public', 'games', 'stormfall');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

if (process.argv.includes('--hash')) {
  for (const f of readdirSync(out).sort()) {
    const buf = readFileSync(path.join(out, f));
    console.log(`"${f}": { "bytes": ${buf.length}, "sha256": "${sha256(buf)}" },`);
  }
  process.exit(0);
}

const strict = process.argv.includes('--strict');
mkdirSync(out, { recursive: true });
// Anything not in the list (an older build's parts) goes, so stale files never ship.
for (const f of readdirSync(out)) if (!manifest.files[f]) rmSync(path.join(out, f), { force: true });

let fetched = 0, kept = 0;
const failed = [];
for (const [name, want] of Object.entries(manifest.files)) {
  const dest = path.join(out, name);
  if (existsSync(dest) && sha256(readFileSync(dest)) === want.sha256) { kept++; continue; }
  const url = `https://raw.githubusercontent.com/${manifest.repo}/${manifest.commit}/${manifest.path}/${name}`;
  try {
    let buf = null, last = '';
    for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const got = Buffer.from(await res.arrayBuffer());
        if (got.length !== want.bytes || sha256(got) !== want.sha256) throw new Error(`checksum mismatch (${got.length} bytes)`);
        buf = got;
      } catch (e) { last = e instanceof Error ? e.message : String(e); }
    }
    if (!buf) throw new Error(last);
    writeFileSync(`${dest}.part`, buf);
    renameSync(`${dest}.part`, dest);
    fetched++;
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (failed.length) {
  const msg = `STORMFALL: ${failed.length} file(s) could not be fetched:\n  ${failed.join('\n  ')}`;
  if (strict) { console.error(`✖ ${msg}`); process.exit(1); }
  console.warn(`⚠ ${msg}\n  The site builds anyway; the game's page will say the game couldn't be downloaded.`);
} else console.log(`STORMFALL: ${fetched} fetched, ${kept} already in place (public/games/stormfall)`);
