import { describe, expect, it } from 'vitest';
import { BUILD_WARN_MIN, LIMIT, STOP, WARN, verdict } from '../../scripts/worker-size.mjs';

// M110: the size alarm's verdict (scripts/worker-size.mjs runs it before every deploy).
const MiB = 1024 * 1024;

describe('size alarm', () => {
  it('only reports the size well under the limit', () => {
    const v = verdict(48.3 * MiB);
    expect(v.level).toBe('ok');
    expect(v.lines).toEqual(['Server code: 48.3 of 64 MB (Cloudflare refuses anything bigger).']);
  });

  it('warns from 55 MB and stops from 60 MB, still under Cloudflare’s 64', () => {
    expect(verdict(WARN - 1).level).toBe('ok');
    expect(verdict(WARN).level).toBe('warn');
    expect(verdict(STOP - 1).level).toBe('warn');
    expect(verdict(STOP).level).toBe('stop');
    expect(verdict(STOP).lines[1]).toMatch(/Too big to deploy/);
    expect(STOP).toBeLessThan(LIMIT);
  });

  it('adds the build minutes and warns near 20', () => {
    expect(verdict(MiB, 12.34).lines.at(-1)).toBe('Build: 12.3 minutes so far (Cloudflare stops a build at 20).');
    const slow = verdict(MiB, BUILD_WARN_MIN);
    expect(slow.slow).toBe(true);
    expect(slow.lines.at(-1)).toMatch(/Close to the limit/);
    expect(verdict(MiB).lines).toHaveLength(1);
  });
});
