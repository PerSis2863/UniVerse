// The facts the "UniVerse explained" whiteboard shows about the code itself (src/components/boards/
// universe-guide.ts): every server route and page, every database table with its number of fields
// and links, the database changes in order, the languages, the unit test files by folder and the
// main library versions; and since M17 every table's fields, every enum, the HTTP methods of each
// route, the core API's endpoints, what each described code file does, every dependency, every test
// file and the build history. Run at build time after gen-api-routes, so the board stays true; only
// the guide board loads it, on demand. `--check` fails if it's stale.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const OUT = join(root, 'src/components/boards/guide-data.gen.ts');

const routes = [...read('cloudflare/api-routes.gen.ts').matchAll(/^\s*\["(\/api\/[^"]+)"/gm)].map((m) => m[1]);
const pages = [...read('cloudflare/page-routes.gen.ts').matchAll(/^\s*\["(\/[^"]*)"/gm)].map((m) => m[1]);
const schema = JSON.parse(read('src/server/owner-schema.json'));
const tables = schema.models.map((m) => [m.name, m.fields.filter((f) => f.kind !== 'object').length, m.fields.filter((f) => f.kind === 'object').length]);
const migrations = readdirSync(join(root, 'prisma/migrations')).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().map((f) => f.replace(/\.sql$/, ''));
const languages = [...read('src/lib/i18n.ts').matchAll(/\{ code: '([a-z-]+)', name: '([^']+)', nativeName: '([^']+)'[^}]*?dir: '(ltr|rtl)'/g)].map((m) => [m[1], m[2], m[3], m[4] === 'rtl']);
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const testsBy = {};
for (const f of walk(join(root, 'src')).filter((f) => /\.test\.tsx?$/.test(f))) {
  const area = f.slice(join(root, 'src').length + 1).split('/').slice(0, 2).join('/').replace(/\/[^/]*\.test\.tsx?$/, '');
  testsBy[area] = (testsBy[area] ?? 0) + 1;
}
const tests = Object.entries(testsBy).sort((a, b) => b[1] - a[1]);
const pkg = JSON.parse(read('package.json'));
const dep = { ...pkg.dependencies, ...pkg.devDependencies };
const versions = Object.fromEntries(['next', 'react', '@opennextjs/cloudflare', '@prisma/client', 'typescript', 'tailwindcss', 'framer-motion', '@excalidraw/excalidraw', '@tiptap/react', 'yjs', 'katex', 'firebase', 'pdfjs-dist', 'vitest', 'axe-core', 'wrangler', 'swr', 'zustand', 'sonner', 'lucide-react', 'date-fns']
  .filter((k) => dep[k]).map((k) => [k, String(dep[k]).replace(/^[\^~]/, '')]));


// Each table's fields: `?` optional, `[]` a list, `→` a link to another table.
const fields = Object.fromEntries(schema.models.map((m) => [m.name, m.fields.map((f) => `${f.kind === 'object' ? '→' : ''}${f.name}${f.list ? '[]' : ''}${f.optional ? '?' : ''}`).join(', ')]));
const enums = (Array.isArray(schema.enums) ? schema.enums : Object.entries(schema.enums).map(([name, values]) => ({ name, values })))
  .map((e) => [e.name, (e.values ?? []).map((v) => (typeof v === 'string' ? v : v.name))]);
// The HTTP methods each app route answers.
const methods = Object.fromEntries(routes.map((r) => {
  const file = join(root, 'src/app', r, 'route.ts');
  const src = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return [r, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => new RegExp(`export (async function|const|function) ${m}\\b|export \\{[^}]*\\b${m}\\b`).test(src)).join(' ')];
}));
// The core API (/api/core/*): each module's controller and its endpoints.
const core = [];
for (const f of readdirSync(join(root, 'src/server/modules')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()) {
  const src = read(`src/server/modules/${f}`);
  const prefix = /router\.controller\('([^']*)'/.exec(src)?.[1] ?? '';
  for (const m of src.matchAll(/\br\.(get|post|put|patch|delete)\('([^']*)'/g)) core.push(`${m[1].toUpperCase()} /${[prefix, m[2]].filter(Boolean).join('/')}`);
}
// What each code file does, from its opening comment (files without one are left out).
const firstSentence = (t) => {
  const clean = t.replace(/\s*\((Stage|Q|M|S)\s?[\d][^)]*\)/g, '').replace(/\s*\([^)]*\b(src|cloudflare|scripts)\/[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const cut = clean.search(/[.:;](\s|$)/);
  const one = cut > 30 ? clean.slice(0, cut) : clean;
  return one.length > 110 ? `${one.slice(0, 107).replace(/\s+\S*$/, '')}…` : one;
};
const described = [];
for (const dir of ['src/server', 'src/lib', 'src/components', 'src/app', 'cloudflare', 'scripts']) {
  for (const f of walk(join(root, dir)).filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.(test|gen)\.|\.d\.ts$/.test(f)).sort()) {
    // The first comment at the top level, before any code (after the imports is fine).
    const all = readFileSync(f, 'utf8').split('\n').slice(0, 80);
    const code = all.findIndex((l) => /^(export|const|let|function|async|type|interface|class|default|declare|module)\b/.test(l));
    const start = all.findIndex((l, i) => (code < 0 || i < code) && /^(\/\/|\/\*\*?)\s*\S/.test(l));
    if (start < 0 || /eslint|@ts-|Generated|^\/\/ *#!/.test(all[start])) continue;
    const head = all.slice(start, start + 12);
    const text = [];
    for (const l of head) { if (!/^\s*(\/\/|\/\*|\*)/.test(l) || /^\s*\*\/\s*$/.test(l)) break; text.push(l.replace(/^\s*(\/\/+|\/\*\*?|\*)\s?/, '').replace(/\*\/\s*$/, '')); }
    const what = firstSentence(text.join(' '));
    if (what.length > 20) described.push([f.slice(root.length), what]);
  }
}
// Boilerplate said in many files ("Built once ahead of time…") and section rules tell nothing.
const said = described.reduce((m, [, t]) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
for (let i = described.length - 1; i >= 0; i--) if (said.get(described[i][1]) > 2 || !/^["'\w]/.test(described[i][1]) || /^(Built once ahead of time|This part's own error screen)/.test(described[i][1])) described.splice(i, 1);
const deps = Object.entries(dep).sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => [n, String(v).replace(/^[\^~]/, ''), !pkg.dependencies?.[n]]);
// Every test file and how many cases it has.
const testFiles = walk(join(root, 'src')).filter((f) => /\.test\.tsx?$/.test(f)).sort()
  .map((f) => [f.slice(join(root, 'src').length + 1), (readFileSync(f, 'utf8').match(/^\s*(it|test)(\.each\([^)]*\))?\(/gm) ?? []).length]);
// The build history: each item in the plan's Progress table and what it was.
const plan = read('STAGE-5-PLAN.md');
const history = [...plan.slice(plan.indexOf('| ID | Item | State')).matchAll(/^\| ([A-Z][0-9A-Za-z.]*) \| ([^|]+) \|/gm)]
  .filter((m) => m[1] !== 'ID').map((m) => { const t = m[2].replace(/\s*\(owner[^)]*\)?/g, '').replace(/[*`]/g, '').trim(); return [m[1], t.length > 140 ? `${t.slice(0, 137).replace(/\s+\S*$/, '')}…` : t]; });

const json = (v) => JSON.stringify(v);
const next = `// Generated by scripts/gen-guide-data.mjs (at build time) for the "UniVerse explained" board. Don't edit.
export const ROUTES: string[] = ${json(routes)};
export const PAGES: string[] = ${json(pages)};
/** [table, fields, links to other tables] */
export const TABLES: [string, number, number][] = ${json(tables)};
export const ENUMS = ${schema.enums.length};
export const MIGRATIONS: string[] = ${json(migrations)};
/** [code, English name, own name, right to left] */
export const LANGUAGES: [string, string, string, boolean][] = ${json(languages)};
/** [folder, test files] */
export const TESTS: [string, number][] = ${json(tests)};
export const VERSIONS: Record<string, string> = ${json(versions)};
/** table → its fields (\`?\` optional, \`[]\` list, \`→\` link) */
export const FIELDS: Record<string, string> = ${json(fields)};
/** [enum, its values] */
export const ENUM_LIST: [string, string[]][] = ${json(enums)};
/** app route → the HTTP methods it answers */
export const METHODS: Record<string, string> = ${json(methods)};
/** The core API (/api/core/…): "METHOD /path" */
export const CORE: string[] = ${json(core)};
/** [file, what it does (its opening comment)] */
export const DESCRIBED: [string, string][] = ${json(described)};
/** [package, version, only for building and testing] */
export const DEPS: [string, string, boolean][] = ${json(deps)};
/** [test file under src/, cases] */
export const TEST_FILES: [string, number][] = ${json(testFiles)};
/** [plan item, what it was] */
export const HISTORY: [string, string][] = ${json(history)};
`;

const old = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
if (process.argv.includes('--check')) {
  if (old !== next) { console.error('guide-data.gen.ts is out of date: run node scripts/gen-guide-data.mjs'); process.exit(1); }
} else if (old !== next) writeFileSync(OUT, next);
console.log(`guide data: ${routes.length} routes, ${core.length} core endpoints, ${pages.length} pages, ${tables.length} tables, ${migrations.length} database changes, ${languages.length} languages, ${described.length} described files, ${history.length} plan items`);
