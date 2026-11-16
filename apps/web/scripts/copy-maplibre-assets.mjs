// Copies MapLibre's worker (~0.5 MB, it cuts map tiles off the page's thread) into public/maplibre, for
// UniVerse Travel's map (M209, src/components/travel/map): the Content-Security-Policy only allows
// workers from this site, and a bundler can't find it by itself. Only downloaded by someone who opens the
// map. Runs before builds and `dev`.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const from = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist', 'maplibre-gl-worker.mjs');
const to = path.join(process.cwd(), 'public', 'maplibre');
if (!existsSync(from)) throw new Error(`MapLibre's worker not found: ${from}`);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
copyFileSync(from, path.join(to, 'maplibre-gl-worker.mjs'));
console.log('Copied the MapLibre worker to public/maplibre');
