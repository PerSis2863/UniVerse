// The text UniVerse Mini (M362) learns from: every sentence UniVerse itself shows people (its pages, help, policies,
// guides and messages), taken out of the app's own source. UniVerse's own words only, no outside text.
// From apps/web: node scripts/ai/mini-corpus.mjs <out.txt>   (the file isn't committed: rebuild it any time)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(new URL('../../src', import.meta.url).pathname).filter((f) => /\.(tsx?|mdx?)$/.test(f) && !/\.(test|gen)\.|\/sample\/|\.d\.ts$/.test(f));
const seen = new Set();
const out = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Text between JSX tags, and quoted strings.
  const bits = [...src.matchAll(/>([^<>{}\n]{20,})</g), ...src.matchAll(/'((?:[^'\\\n]|\\.){20,})'|"((?:[^"\\\n]|\\.){20,})"|`([^`$\\\n]{20,})`/g)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim());
  for (let t of bits) {
    t = t.replace(/\\'/g, "'").replace(/&apos;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const words = t.split(' ');
    if (words.length < 5 || /[{}<>=_|\\#@]|\/\w|\w\.\w|\(\)|^[a-z-]+:|https?:/.test(t)) continue; // code, class lists, paths, links
    if ((t.match(/[A-Za-z]/g) ?? []).length < t.length * 0.7 || /\b(px|rem|flex|grid|text-|bg-|rounded)\b/.test(t)) continue;
    if (!/^[A-Z“"‘']/.test(t) || seen.has(t)) continue; // sentences start with a capital
    seen.add(t);
    out.push(t);
  }
}
writeFileSync(process.argv[2] ?? 'mini-corpus.txt', out.join('\n') + '\n');
console.log(`${out.length} sentences, ${out.join('\n').length} characters`);
