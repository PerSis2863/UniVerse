// Starts scripts/ai/hyperion-lab.mts (Hyperion's engine for training its AI, M435) as one ES module: the engine's files
// import each other in a circle that only loads in ES-module order, so they are bundled first with esbuild (the copy
// tsx brings). From apps/web:   node scripts/ai/hyperion-lab.mjs help | run < scripts.jsonl
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
const here = fileURLToPath(new URL('.', import.meta.url));
const out = join(tmpdir(), `hyperion-lab-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [join(here, 'hyperion-lab.mts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning', tsconfig: join(here, '../../tsconfig.json') });
await import(pathToFileURL(out).href);
