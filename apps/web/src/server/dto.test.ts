import { describe, expect, it } from 'vitest';
import { CreateKnowledgeHubDto, CreateQuizDto, RequestCredentialDto, UpdateQuizDto, validate } from './dto';

// The request body rules (zod 4): unknown properties refused, required ones checked, the old
// NestJS-style message list in the 400.
const fails = (schema: Parameters<typeof validate>[0], body: unknown): string[] => {
  try { validate(schema, body); } catch (e) { return ((e as { response?: { message?: string[] } }).response?.message) ?? [String(e)]; }
  throw new Error('expected a 400');
};

describe('dto validate (zod 4)', () => {
  it('accepts a good body and returns it', () => {
    expect(validate(CreateQuizDto, { courseId: 'c1', title: 'Week 1', status: 'PUBLISHED', dueDate: '2026-11-20T10:00:00Z' })).toMatchObject({ courseId: 'c1', title: 'Week 1' });
    expect(validate(UpdateQuizDto, {})).toEqual({});
  });
  it('refuses unknown properties the way the old API did', () => {
    expect(fails(CreateQuizDto, { courseId: 'c1', title: 't', isAdmin: true })).toContain('property isAdmin should not exist');
  });
  it('names a missing or wrong field', () => {
    const msg = fails(CreateQuizDto, { title: 't' });
    expect(msg.some((m) => m.startsWith('courseId '))).toBe(true);
    expect(fails(CreateQuizDto, { courseId: 'c', title: 't', status: 'NOPE' }).some((m) => m.startsWith('status '))).toBe(true);
    expect(fails(CreateQuizDto, { courseId: 'c', title: 't', dueDate: 'tomorrow' })).toContain('dueDate must be a valid ISO 8601 date string');
  });
  it('keeps links to http and https', () => {
    expect(validate(CreateKnowledgeHubDto, { title: 'x', url: 'https://example.com/a' })).toMatchObject({ url: 'https://example.com/a' });
    expect(fails(CreateKnowledgeHubDto, { title: 'x', url: 'javascript:alert(1)' }).some((m) => m.startsWith('url '))).toBe(true);
    expect(fails(CreateKnowledgeHubDto, { title: 'x', url: 'ftp://example.com' }).some((m) => m.startsWith('url '))).toBe(true);
  });
  it('trims and bounds credential fields', () => {
    const ok = validate<{ title: string }>(RequestCredentialDto, { title: '  Beach clean  ', projectName: 'Shore', organization: 'Green Club', hoursCompleted: 4, peopleImpacted: 30 });
    expect(ok.title).toBe('Beach clean');
    expect(fails(RequestCredentialDto, { title: 'ab', projectName: 'Shore', organization: 'Green Club', hoursCompleted: -1, peopleImpacted: 3 }).length).toBeGreaterThanOrEqual(2);
  });
});
