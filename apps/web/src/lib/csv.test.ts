import { describe, expect, it } from 'vitest';
import { detectDelimiter, mapHeaders, parseCsv, toCsv, toRecords } from './csv';

describe('reading CSV', () => {
  it('reads plain rows and drops empty lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
  it('handles quotes, commas, doubled quotes and line breaks inside cells', () => {
    expect(parseCsv('name,note\n"Doe, Jane","She said ""hi""\nthen left"\n')).toEqual([['name', 'note'], ['Doe, Jane', 'She said "hi"\nthen left']]);
  });
  it('handles Windows line ends and the byte-order mark', () => {
    expect(parseCsv('\uFEFFemail,role\r\na@x.com,student\r\n')).toEqual([['email', 'role'], ['a@x.com', 'student']]);
  });
  it('spots semicolon and tab files', () => {
    expect(detectDelimiter('email;role\na;b')).toBe(';');
    expect(detectDelimiter('email\trole')).toBe('\t');
    expect(detectDelimiter('"a;b",c')).toBe(',');
    expect(parseCsv('email;courses\na@x.com;"CS101;CS201"')).toEqual([['email', 'courses'], ['a@x.com', 'CS101;CS201']]);
  });
  it('keeps a last line without a line end', () => expect(parseCsv('a\nb')).toEqual([['a'], ['b']]));
});

describe('matching headers', () => {
  const cols = [{ key: 'email', label: 'Email', aliases: ['e-mail', 'email address'] }, { key: 'course', label: 'Course code', aliases: ['class'] }, { key: 'role', label: 'Role' }];
  it('matches by key, label or alias, ignoring case and punctuation', () => {
    expect(mapHeaders(['E-Mail', 'Class', 'Something'], cols)).toEqual({ email: 0, course: 1, role: -1 });
    expect(mapHeaders(['Email Address', 'COURSE CODE', 'role'], cols)).toEqual({ email: 0, course: 1, role: 2 });
  });
  it('uses each header once', () => expect(mapHeaders(['email', 'email'], [{ key: 'email', label: 'Email' }, { key: 'other', label: 'Other', aliases: ['email'] }])).toEqual({ email: 0, other: 1 }));
  it('turns rows into records, leaving out blank cells', () => {
    expect(toRecords([[' a@x.com ', '', 'CS101']], { email: 0, role: 1, course: 2 })).toEqual([{ email: 'a@x.com', course: 'CS101' }]);
  });
});

describe('writing CSV', () => {
  it('quotes what needs it and neutralises formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], ['say "hi"', null]])).toBe('a,b\r\n"x,y",\'=SUM(A1)\r\n"say ""hi""",');
  });
});
