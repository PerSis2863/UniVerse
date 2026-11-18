import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ default: {} }));
import { safeUrl } from './portfolio';

// M296: links on a portfolio others open are only web links or the app's own files.
describe('portfolio links', () => {
  it('keeps https and the app’s files only', () => {
    expect(safeUrl('https://github.com/ana/robot')).toBe('https://github.com/ana/robot');
    expect(safeUrl('/api/files/u1/report.pdf')).toBe('/api/files/u1/report.pdf');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('http://insecure.example')).toBeNull();
    expect(safeUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeUrl('/api/files/../../etc')).toBeNull();
  });
});
