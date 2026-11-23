// Runs one of the training kits' TypeScript files (hyperion-lab.mts, agents-lab.mts, ghidra-exam.mts) as a single ES
// module: the app's own files are bundled first with esbuild (the copy tsx brings), with the app's tsconfig so `@/…`
// imports resolve. With `{ app: true }` the website's server files can be imported too: the database client is
// replaced by an empty stand-in (nothing here reads the database) and the bundle sits beside node_modules.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL('.', import.meta.url));

const NO_DB = {
  name: 'no-db',
  setup(b) {
    b.onResolve({ filter: /^(@\/lib\/db|@prisma\/client|@prisma\/adapter-d1)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const p = new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : p), apply: () => p, construct: () => p });\nexport default p; export const Prisma = p; export const PrismaClient = p; export const PrismaD1 = p;',
      loader: 'js',
    }));
  },
};

export async function runTs(file, { app = false } = {}) {
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('tsx')] }));
  const dir = app ? join(here, '../../node_modules/.cache') : tmpdir();
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${file.replace(/\W/g, '-')}-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [join(here, file)], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning', tsconfig: join(here, '../../tsconfig.json'),
    ...(app ? {
      plugins: [NO_DB], external: ['playwright'], loader: { '.wasm': 'empty' },
      banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __filename.replace(/[^/]*$/, '');" },
    } : {}),
  });
  await import(pathToFileURL(out).href);
}
