// Copies Excalidraw's fonts into public/excalidraw-assets so the whiteboard loads them from this
// site (the Content-Security-Policy doesn't allow Excalidraw's default CDN). Runs before builds.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// The package's main file is dist/prod/index.js; the fonts sit next to it.
const from = path.join(path.dirname(require.resolve('@excalidraw/excalidraw')), '..', 'prod', 'fonts');
const to = path.join(process.cwd(), 'public', 'excalidraw-assets', 'fonts');
if (!existsSync(from)) throw new Error(`Excalidraw fonts not found at ${from}`);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log('Copied Excalidraw fonts to public/excalidraw-assets/fonts');
