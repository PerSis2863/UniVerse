// Copies pdf.js's worker (~1 MB, the legacy build for older phones) into public/pdfjs, for file previews in chats
// (src/lib/pdf.ts): the Content-Security-Policy only allows workers from this site. Only downloaded
// by someone who opens or previews a PDF. Runs before builds and `dev`.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const from = path.join(path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')), 'pdf.worker.min.mjs');
const to = path.join(process.cwd(), 'public', 'pdfjs');
if (!existsSync(from)) throw new Error(`pdf.js worker not found: ${from}`);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
copyFileSync(from, path.join(to, 'pdf.worker.min.mjs'));
console.log('Copied the pdf.js worker to public/pdfjs');
