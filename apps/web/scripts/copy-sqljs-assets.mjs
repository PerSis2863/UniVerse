// Copies sql.js (SQLite in WebAssembly, ~0.7 MB) into public/sqljs, for running SQL in code rooms
// and doc code blocks on the student's own device (src/lib/code-runner.ts): the
// Content-Security-Policy only allows scripts from this site. Only downloaded by someone who runs
// SQL. Runs before builds and `dev`.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const from = path.dirname(require.resolve('sql.js/dist/sql-wasm-browser.js'));
const to = path.join(process.cwd(), 'public', 'sqljs');
const files = ['sql-wasm-browser.js', 'sql-wasm-browser.wasm'];
for (const f of files) if (!existsSync(path.join(from, f))) throw new Error(`sql.js file not found: ${path.join(from, f)}`);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(path.join(from, f), path.join(to, f));
console.log('Copied sql.js to public/sqljs');
