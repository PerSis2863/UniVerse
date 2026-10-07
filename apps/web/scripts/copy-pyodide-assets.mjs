// Copies Pyodide (Python in WebAssembly, ~12 MB) into public/pyodide, for running Python in code
// rooms on the student's own device (src/lib/code-runner.ts): the Content-Security-Policy only
// allows scripts from this site. Only downloaded by someone who runs Python. Runs before builds and `dev`.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const from = path.dirname(require.resolve('pyodide/pyodide.mjs'));
const to = path.join(process.cwd(), 'public', 'pyodide');
const files = ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
for (const f of files) if (!existsSync(path.join(from, f))) throw new Error(`Pyodide file not found: ${path.join(from, f)}`);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(path.join(from, f), path.join(to, f));
console.log('Copied Pyodide to public/pyodide');
