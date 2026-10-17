import { describe, expect, it } from 'vitest';
import { cleanPassportHandle, cleanPassportTheme } from './passport-theme';

describe('passport-theme', () => {
  it('accepts known themes and defaults unknown', () => {
    expect(cleanPassportTheme('emerald')).toBe('emerald');
    expect(cleanPassportTheme('nope')).toBe('indigo');
  });

  it('cleans vanity handles', () => {
    expect(cleanPassportHandle('Ada-Lovelace')).toBe('ada-lovelace');
    expect(cleanPassportHandle('')).toBe(null);
    expect(cleanPassportHandle(null)).toBe(null);
    expect(cleanPassportHandle('ab')).toBe(undefined);
    expect(cleanPassportHandle('open')).toBe(undefined);
    expect(cleanPassportHandle('-bad-')).toBe(undefined);
  });
});
