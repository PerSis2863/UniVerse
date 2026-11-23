import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SANDBOX_CSP, securityHeaders } from '../../security-headers';

// M469: Hyperion's sealed runner (public/sandbox/run.html) carries its own policy, the same on Cloudflare's static
// files (public/_headers) and on the dev server (next.config.ts), and the site's own policy never takes in the
// outside folders the runner may use.
describe('Hyperion’s sealed runner and its policy', () => {
  it('public/_headers sends the runner exactly SANDBOX_CSP, under both of its addresses', () => {
    const h = readFileSync('public/_headers', 'utf8');
    for (const path of ['/sandbox/run', '/sandbox/run.html']) expect(h).toContain(`${path}\n  Content-Security-Policy: ${SANDBOX_CSP}\n`);
  });
  it('the site’s policy doesn’t allow eval, Pyodide or webR; only the runner’s does, and only Hyperion may frame it', () => {
    const site = securityHeaders.find((x) => x.key === 'Content-Security-Policy')!.value;
    expect(site).not.toMatch(/pyodide|r-wasm/);
    expect(SANDBOX_CSP).toMatch(/frame-ancestors 'self'/);
    expect(SANDBOX_CSP).toMatch(/default-src 'none'/);
    expect(SANDBOX_CSP).not.toMatch(/https:\/\/cdn\.jsdelivr\.net\/(?!pyodide\/v[\d.]+\/full\/)/);
  });
  it('the runner page is framed sealed: scripts only, never the site’s own origin', () => {
    const runner = readFileSync('src/components/lab/lang-runner.ts', 'utf8');
    expect(runner).toMatch(/setAttribute\('sandbox', 'allow-scripts'\)/);
  });
});
