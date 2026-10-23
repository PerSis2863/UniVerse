// The checks before every commit (apps/web/AGENTS.md): types, lint on the files changed since
// main, the unit tests, and the lean check (no unused files, no links to missing pages). Run from apps/web:  pnpm check
import { spawnSync } from 'node:child_process';
import { APP, run } from './run.mjs';

run('pnpm', ['typecheck']);
const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'origin/main', '--', '.'], { cwd: APP, encoding: 'utf8' });
const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', '.'], { cwd: APP, encoding: 'utf8' });
const files = [...new Set(`${diff.stdout ?? ''}\n${untracked.stdout ?? ''}`.split('\n'))]
  .map((f) => f.trim().replace(/^apps\/web\//, ''))
  .filter((f) => /\.(m?[jt]sx?)$/.test(f) && /^(src|cloudflare|scripts)\//.test(f));
if (files.length) run('npx', ['eslint', ...files]);
else console.log('\n(no changed code files to lint)');
run('npx', ['vitest', 'run']);
run('node', ['scripts/lean.mjs']);
console.log('\n✔ All checks passed.');
