import { describe, expect, it } from 'vitest';
import { CreateKnowledgeHubDto, CreateQuizDto, RequestCredentialDto, UpdateQuizDto, validate } from './dto';

const fail = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    return (e as { response: { message: string[] } }).response.message;
  }
  throw new Error('expected a 400');
};

describe('request body rules', () => {
  it('keeps a good body and trims text', () => {
    const body = { title: '  Beach clean  ', projectName: 'Shore', organization: 'Club', hoursCompleted: 3, peopleImpacted: 40 };
    expect(validate(RequestCredentialDto, body)).toMatchObject({ title: 'Beach clean' });
  });

  it('refuses properties it does not know, by name', () => {
    expect(fail(() => validate(CreateQuizDto, { courseId: 'c', title: 't', role: 'ADMIN' }))).toEqual(['property role should not exist']);
    expect(fail(() => validate(UpdateQuizDto, { score: 1 }))).toEqual(['property score should not exist']);
  });

  it('checks enums, numbers, dates and links', () => {
    expect(validate(CreateQuizDto, { courseId: 'c', title: 't', status: 'PUBLISHED' })).toMatchObject({ status: 'PUBLISHED' });
    expect(fail(() => validate(CreateQuizDto, { courseId: 'c', title: 't', status: 'NOPE' }))[0]).toMatch(/^status /);
    expect(fail(() => validate(CreateQuizDto, { courseId: 'c', title: 't', timeLimit: 1.5 }))[0]).toMatch(/^timeLimit /);
    expect(fail(() => validate(CreateQuizDto, { courseId: 'c', title: 't', dueDate: 'soon' }))).toEqual(['dueDate must be a valid ISO 8601 date string']);
    expect(fail(() => validate(CreateKnowledgeHubDto, { title: 't', url: 'javascript:alert(1)' }))[0]).toMatch(/^url /);
    expect(fail(() => validate(CreateQuizDto, undefined)).length).toBe(2);
  });
});
