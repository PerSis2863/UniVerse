import { describe, expect, it } from 'vitest';
import { readCodes, readDay, readRole, readTime } from './bulk-import';
import { demoWriteBlocked } from './auth';

describe('reading import cells', () => {
  it('reads roles the way schools write them', () => {
    expect(readRole(undefined)).toBe('STUDENT');
    expect(readRole(' Pupil ')).toBe('STUDENT');
    expect(readRole('Staff')).toBe('TEACHER');
    expect(readRole('Lecturer')).toBe('TEACHER');
    expect(readRole('admin')).toBeNull(); // admins aren't made from a file
  });
  it('reads days as short names, full names or numbers (Monday = 1)', () => {
    expect(readDay('Mon')).toBe(0);
    expect(readDay('tuesday')).toBe(1);
    expect(readDay('Thurs')).toBe(3);
    expect(readDay('7')).toBe(6);
    expect(readDay('Funday')).toBeNull();
    expect(readDay('monkey')).toBeNull();
    expect(readDay('')).toBeNull();
  });
  it('reads times', () => {
    expect(readTime('9:00')).toBe('09:00');
    expect(readTime('09.30')).toBe('09:30');
    expect(readTime('1430')).toBe('14:30');
    expect(readTime('24:00')).toBeNull();
    expect(readTime('9am')).toBeNull();
  });
  it('splits course lists on ; | or , and drops repeats', () => {
    expect(readCodes('CS101; MATH110 |CS101,  PHY1')).toEqual(['CS101', 'MATH110', 'PHY1']);
    expect(readCodes(undefined)).toEqual([]);
  });
});

describe('the demo admin and imports', () => {
  const req = (path: string, method = 'POST') => new Request(`https://x.test${path}`, { method });
  const admin = { role: 'ADMIN' };
  const token = 'mock-token-demo@admin.com';
  it('may preview an import (it only reads)', () => expect(demoWriteBlocked(req('/api/admin/import/preview'), admin, token)).toBe(false));
  it('may not import, undo or change fees', () => {
    for (const p of ['/api/admin/import', '/api/admin/import/abc', '/api/admin/import/preview/x', '/api/fees/plans', '/api/fees/invoices/abc']) expect(demoWriteBlocked(req(p), admin, token), p).toBe(true);
  });
  it('may export (a read)', () => expect(demoWriteBlocked(req('/api/admin/import/export?kind=students', 'GET'), admin, token)).toBe(false));
});
