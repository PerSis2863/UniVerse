import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { textHash } from '@/lib/text-hash';
import { AiLimitError, requireAi } from './ai-budget';
import { geminiJson } from './gemini';
import { levelItems } from './reading-level';
import { readable } from './text-translate';

vi.mock('@/lib/db', () => ({ default: { leveledText: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() } } }));
vi.mock('./text-translate', () => ({ readable: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./moderation', () => ({ featureOff: vi.fn().mockResolvedValue(false) }));
vi.mock('./ai-budget', () => {
  class AiLimitError extends Error {}
  return { AiLimitError, requireAi: vi.fn().mockResolvedValue(undefined) };
});

const user: SessionUser = { id: 'u1', role: 'STUDENT', email: 's@example.edu', name: 'Sam' };
const db = prisma as unknown as { leveledText: { findMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> } };
type Ask = { items: { id: string; text: string }[] };
const asked = (call: unknown[]) => JSON.parse(String(call[1]).replace(/^Texts \(JSON\):\n/, '')) as Ask['items'];

describe('reading levels on the server (Stage 5 · D9)', () => {
  const key = process.env.GEMINI_API_KEY;
  afterAll(() => { if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key; });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-only';
    db.leveledText.findMany.mockResolvedValue([]);
    db.leveledText.createMany.mockResolvedValue({ count: 0 });
  });

  it('uses stored rewrites when the text is unchanged and asks the AI only for the rest', async () => {
    vi.mocked(readable).mockResolvedValue(new Map([['material-part:s.0', 'A scheduler picks programs.'], ['material-part:s.1', 'Preemption stops a program.']]));
    db.leveledText.findMany.mockResolvedValue([
      { kind: 'material-part', refId: 's.0', text: 'Stored simple text.', terms: '[]', srcHash: textHash('A scheduler picks programs.') },
      { kind: 'material-part', refId: 's.1', text: 'Old.', terms: '[]', srcHash: 'edited-since' },
    ]);
    vi.mocked(geminiJson).mockResolvedValue({ items: [{ id: 'material-part:s.1', text: 'The computer can stop a program to give another a turn.', terms: [{ term: 'program', meaning: 'An app.' }, { term: 'preemption', meaning: 'Not in the rewrite.' }] }] });
    const r = await levelItems(user, { items: [{ kind: 'material-part', id: 's.0' }, { kind: 'material-part', id: 's.1' }], level: 'g5' });
    expect(r.levels['material-part:s.0'].text).toBe('Stored simple text.');
    expect(r.levels['material-part:s.1']).toEqual({ text: 'The computer can stop a program to give another a turn.', terms: [{ term: 'program', meaning: 'An app.' }] });
    expect(asked(vi.mocked(geminiJson).mock.calls[0])).toEqual([{ id: 'material-part:s.1', text: 'Preemption stops a program.' }]);
    expect(requireAi).toHaveBeenCalledTimes(1);
    expect(db.leveledText.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ kind: 'material-part', refId: 's.1', level: 'g5', lang: '', srcHash: textHash('Preemption stops a program.') })] });
  });

  it('writes in the reader’s language when asked, and stores it apart', async () => {
    vi.mocked(readable).mockResolvedValue(new Map([['assignment:a1', 'Explain round-robin scheduling.']]));
    vi.mocked(geminiJson).mockResolvedValue({ items: [{ id: 'assignment:a1', text: 'Explique le tourniquet.', terms: [] }] });
    await levelItems(user, { items: [{ kind: 'assignment', id: 'a1' }], level: 'g8', to: 'fr' });
    expect(vi.mocked(geminiJson).mock.calls[0][0]).toContain('Write in French (fr)');
    expect(vi.mocked(geminiJson).mock.calls[0][0]).toContain('Grade 8');
    expect(db.leveledText.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ level: 'g8', lang: 'fr' }) }));
    expect(db.leveledText.createMany.mock.calls[0][0].data[0]).toMatchObject({ lang: 'fr', level: 'g8' });
  });

  it('rewrites a long text in sections and joins them, with all key terms', async () => {
    const long = Array.from({ length: 4 }, (_, i) => `Paragraph ${i} ${'word '.repeat(150)}`.trim()).join('\n\n');
    vi.mocked(readable).mockResolvedValue(new Map([['assignment:a2', long]]));
    vi.mocked(geminiJson).mockImplementation(async (_s, prompt) => {
      const items = JSON.parse(String(prompt).replace(/^Texts \(JSON\):\n/, '')) as { id: string }[];
      return { items: items.map((x) => ({ id: x.id, text: `Short ${x.id.split('#')[1]} about loops.`, terms: [{ term: 'loops', meaning: 'Repeating steps.' }] })) };
    });
    const r = await levelItems(user, { items: [{ kind: 'assignment', id: 'a2' }], level: 'g5' });
    const got = r.levels['assignment:a2'];
    expect(got.text.split('\n\n').length).toBeGreaterThan(1);
    expect(got.text.startsWith('Short 0 about loops.')).toBe(true);
    expect(got.terms).toEqual([{ term: 'loops', meaning: 'Repeating steps.' }]);
    expect(requireAi).toHaveBeenCalledTimes(1); // one AI request for the reader, however many calls
  });

  it('keeps nothing when the AI fails, and says so', async () => {
    vi.mocked(readable).mockResolvedValue(new Map([['material-part:s.0', 'Text.']]));
    vi.mocked(geminiJson).mockResolvedValue(null);
    await expect(levelItems(user, { items: [{ kind: 'material-part', id: 's.0' }], level: 'g5' })).rejects.toMatchObject({ message: expect.stringContaining('couldn’t make a simpler version') });
    expect(db.leveledText.createMany).not.toHaveBeenCalled();
  });

  it('out of AI for today: hands back what is stored, or a 429 when nothing is', async () => {
    vi.mocked(readable).mockResolvedValue(new Map([['material-part:s.0', 'Kept.'], ['material-part:s.1', 'New.']]));
    db.leveledText.findMany.mockResolvedValue([{ kind: 'material-part', refId: 's.0', text: 'Kept simple.', terms: '[]', srcHash: textHash('Kept.') }]);
    vi.mocked(requireAi).mockRejectedValueOnce(new AiLimitError('No AI left today.'));
    const r = await levelItems(user, { items: [{ kind: 'material-part', id: 's.0' }, { kind: 'material-part', id: 's.1' }], level: 'g5' });
    expect(Object.keys(r.levels)).toEqual(['material-part:s.0']);
    db.leveledText.findMany.mockResolvedValue([]);
    vi.mocked(requireAi).mockRejectedValueOnce(new AiLimitError('No AI left today.'));
    await expect(levelItems(user, { items: [{ kind: 'material-part', id: 's.1' }], level: 'g5' })).rejects.toMatchObject({ message: 'No AI left today.' });
    expect(geminiJson).not.toHaveBeenCalled();
  });

  it('only rewrites texts the reader may read, of the kinds it knows', async () => {
    vi.mocked(readable).mockResolvedValue(new Map());
    const r = await levelItems(user, { items: [{ kind: 'material-part', id: 'secret.0' }, { kind: 'group-post', id: 'p' }], level: 'g5' });
    expect(r.levels).toEqual({});
    expect(vi.mocked(readable).mock.calls[0][1]).toEqual([{ kind: 'material-part', id: 'secret.0' }]);
    expect(geminiJson).not.toHaveBeenCalled();
  });
});
