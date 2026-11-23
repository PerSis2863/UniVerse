// Runs one of the training kits' TypeScript files (hyperion-lab.mts, agents-lab.mts) as a single ES module: the app's
// own files are bundled first with esbuild (the copy tsx brings), with the app's tsconfig so `@/…` imports resolve.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL('.', import.meta.url));

export async function runTs(file) {
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
  const out = join(tmpdir(), `${file.replace(/\W/g, '-')}-${process.pid}.mjs`);
  await esbuild.build({ entryPoints: [join(here, file)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning', tsconfig: join(here, '../../tsconfig.json') });
  await import(pathToFileURL(out).href);
}
