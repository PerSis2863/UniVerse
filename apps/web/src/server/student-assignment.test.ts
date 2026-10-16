import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));

import { fingerprint, readReceipt, receiptFor } from './student-assignment';

const sub = { id: 'cmsub0000000000000000001', submittedAt: new Date('2026-10-16T09:30:00Z'), text: 'My answer', fileUrl: null, linkUrl: null };
const before = process.env.SESSION_SECRET;
afterEach(() => { process.env.SESSION_SECRET = before; });

describe('hand-in receipts', () => {
  it('needs the signing secret', () => {
    delete process.env.SESSION_SECRET;
    expect(receiptFor(sub)).toBeNull();
  });
  it('reads back what it signed, and refuses anything changed', () => {
    process.env.SESSION_SECRET = 'test-only-'.padEnd(40, 'x');
    const code = receiptFor(sub)!;
    expect(readReceipt(code)).toEqual({ submissionId: sub.id, submittedAt: sub.submittedAt, fingerprint: fingerprint(sub) });
    const parts = code.split('.');
    expect(readReceipt([...parts.slice(0, 3), fingerprint({ text: 'Another answer' }), parts[4]].join('.'))).toBeNull();
    expect(readReceipt(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(readReceipt('nonsense')).toBeNull();
    process.env.SESSION_SECRET = 'another-test-only-'.padEnd(40, 'y');
    expect(readReceipt(code)).toBeNull();
  });
  it('fingerprints the text, file and link', () => {
    expect(fingerprint({ text: 'a' })).not.toBe(fingerprint({ text: 'a', linkUrl: 'https://x.example' }));
    expect(fingerprint({ text: 'a' })).toHaveLength(16);
  });
});
