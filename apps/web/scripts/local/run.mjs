// Small helpers for the local scripts (scripts/local): run a command in the app's folder and stop on failure.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The app's folder (apps/web), wherever the project is. */
export const APP = fileURLToPath(new URL('../..', import.meta.url));

/** Runs a command there, printing as it goes; exits if it fails (unless `ok` says that's fine). */
export function run(cmd, args, { env = {}, ok = false } = {}) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: APP, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  if (r.status !== 0 && !ok) {
    console.error(`\n✖ That step failed (${cmd} ${args[0] ?? ''}).`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}
