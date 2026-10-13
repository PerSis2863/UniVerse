import { describe, expect, it } from 'vitest';
import { excerpt, isAiPolicy, parseReceipt, receiptProblem, usesSummary } from './ai-receipt';

describe('honest AI receipts (Stage 5 · D12)', () => {
  it('knows the three rules', () => {
    expect(['FREE', 'RECEIPT', 'NONE'].every(isAiPolicy)).toBe(true);
    expect(isAiPolicy('toString')).toBe(false);
  });

  it('checks what the student chose against the assignment’s rule', () => {
    expect(receiptProblem('FREE', {})).toBeNull();
    expect(receiptProblem('FREE', { attach: true })).toBeNull();
    expect(receiptProblem('RECEIPT', {})).toMatch(/asks for your AI receipt/);
    expect(receiptProblem('RECEIPT', { attach: true })).toBeNull();
    expect(receiptProblem('NONE', {})).toMatch(/doesn’t allow AI/);
    expect(receiptProblem('NONE', { declaredNone: true })).toBeNull();
    expect(receiptProblem('NONE', { attach: true })).toBeNull();
    expect(receiptProblem('NONE', { attach: true, declaredNone: true })).toMatch(/Choose one/);
    expect(receiptProblem('RECEIPT', { attach: 'yes' })).toMatch(/asks for/);
  });

  it('keeps excerpts short and on one line', () => {
    expect(excerpt('  What is\n\nrecursion?  ')).toBe('What is recursion?');
    expect(excerpt('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('summarises the uses, most used first', () => {
    expect(usesSummary([{ kind: 'writing' }, { kind: 'tutor' }, { kind: 'tutor' }, { kind: 'mystery' }])).toBe('Course AI tutor ×2 · Writing helper (Docs) ×1 · AI help ×1');
    expect(usesSummary([])).toBe('');
  });

  it('reads stored receipts safely', () => {
    const r = parseReceipt(JSON.stringify({ policy: 'RECEIPT', attached: true, note: 'Used it for an outline', uses: [{ kind: 'tutor', detail: 'What is a quantum?', at: '2026-10-01T10:00:00Z' }, { bad: 1 }], since: '2026-09-30', at: '2026-10-02' }));
    expect(r).toMatchObject({ policy: 'RECEIPT', attached: true, declaredNone: false, note: 'Used it for an outline' });
    expect(r?.uses).toEqual([{ kind: 'tutor', detail: 'What is a quantum?', at: '2026-10-01T10:00:00Z', courseId: null }]);
    expect(parseReceipt('{broken')).toBeNull();
    expect(parseReceipt(JSON.stringify({ policy: 'MAYBE' }))).toBeNull();
    expect(parseReceipt(null)).toBeNull();
  });
});
