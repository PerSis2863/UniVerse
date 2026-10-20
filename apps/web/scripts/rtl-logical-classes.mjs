// Stage 5 · Q21: turns left/right Tailwind classes into start/end ones, so layouts mirror by
// themselves in right-to-left languages (Arabic, Urdu) and look exactly the same left-to-right.
//   ml-/mr- → ms-/me-   pl-/pr- → ps-/pe-   left-/right- → start-/end-   text-left/right → text-start/end
//   rounded-l/r/tl/tr/bl/br → rounded-s/e/ss/se/es/ee   border-l/r → border-s/e
//   translate-x-N gets an rtl: mirror (slide-in panels, switch knobs).
// Kept physical: left-1/2 / right-1/2 and translate-x-1/2 (centring with a half-width shift).
// Run from apps/web: node scripts/rtl-logical-classes.mjs [--check]   (--check: list files, change nothing)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/app'];
const check = process.argv.includes('--check');
const B = String.raw`(^|[\s"'\x60{(:!])`; // a class starts after a space, quote, backtick, brace, paren, variant colon or !
const V = String.raw`(\[[^\]\s]+\]|\d+(?:\.\d+)?|px|auto|full)`; // a spacing value
const rules = [
  [new RegExp(`${B}(-?)m([lr])-${V}(?=$|[\\s"'\\x60})])`, 'g'), (_, b, neg, side, v) => `${b}${neg}m${side === 'l' ? 's' : 'e'}-${v}`],
  [new RegExp(`${B}p([lr])-${V}(?=$|[\\s"'\\x60})])`, 'g'), (_, b, side, v) => `${b}p${side === 'l' ? 's' : 'e'}-${v}`],
  [new RegExp(`${B}(-?)(left|right)-(?!1/2)(\\[[^\\]\\s]+\\]|\\d+(?:\\.\\d+)?|px|auto|full|\\d/\\d)(?=$|[\\s"'\\x60})])`, 'g'), (_, b, neg, side, v) => `${b}${neg}${side === 'left' ? 'start' : 'end'}-${v}`],
  [new RegExp(`${B}text-(left|right)(?=$|[\\s"'\\x60})])`, 'g'), (_, b, side) => `${b}text-${side === 'left' ? 'start' : 'end'}`],
  [new RegExp(`${B}rounded-(tl|tr|bl|br|l|r)(?=$|-|[\\s"'\\x60})])`, 'g'), (_, b, c) => `${b}rounded-${{ tl: 'ss', tr: 'se', bl: 'es', br: 'ee', l: 's', r: 'e' }[c]}`],
  [new RegExp(`${B}border-(l|r)(?=$|-(?:\\d|\\[|transparent|white|black|current|[a-z]+-\\d)|[\\s"'\\x60})])`, 'g'), (_, b, side) => `${b}border-${side === 'l' ? 's' : 'e'}`],
];
// translate-x-N (not 1/2, not 0, no variant before it) gets its mirror for right-to-left.
const translate = new RegExp(String.raw`(^|[\s"'\x60{(])(-?)translate-x-(?!1/2(?![\d]))(?!0(?![\d.]))(\[[^\]\s]+\]|\d+(?:\.\d+)?|px|full|\d/\d)(?=$|[\s"'\x60})])(?!\s+rtl:)`, 'g');

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) files.push(p);
  }
};
ROOTS.forEach(walk);

let changed = 0;
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  let s = before;
  for (const [re, to] of rules) s = s.replace(re, to);
  s = s.replace(translate, (_, b, neg, v) => `${b}${neg}translate-x-${v} rtl:${neg ? '' : '-'}translate-x-${v}`);
  if (s !== before) {
    changed++;
    if (check) console.log(f);
    else writeFileSync(f, s);
  }
}
console.log(`${changed} of ${files.length} files ${check ? 'would change' : 'changed'}`);
