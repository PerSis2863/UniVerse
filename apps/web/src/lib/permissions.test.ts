import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, expand, isPermission, userCan } from './permissions';
import { permissionsOf } from '@/server/permissions';

describe('permissions', () => {
  it('“manage” includes “see” in the same area, and nothing else', () => {
    expect([...expand(['fees.manage'])].sort()).toEqual(['fees.manage', 'fees.view']);
    expect([...expand(['admissions.manage'])].sort()).toEqual(['admissions.manage', 'admissions.review']);
    expect([...expand(['fees.view'])]).toEqual(['fees.view']);
  });
  it('ignores unknown names', () => {
    expect([...expand(['fees.view', 'everything', 'admin'])]).toEqual(['fees.view']);
    expect(isPermission('fees.manage')).toBe(true);
    expect(isPermission('toString')).toBe(false);
  });
  it('lets admins do everything in the browser, and others only what their roles give', () => {
    expect(userCan({ role: 'ADMIN' }, 'import.run')).toBe(true);
    expect(userCan({ role: 'TEACHER', permissions: ['fees.manage'] }, 'fees.view')).toBe(true);
    expect(userCan({ role: 'TEACHER', permissions: ['fees.view'] }, 'fees.manage')).toBe(false);
    expect(userCan({ role: 'TEACHER' }, 'export.run')).toBe(false);
    expect(userCan(null, 'fees.view')).toBe(false);
  });
});

describe('who has which permissions on the server', () => {
  it('admins have all of them, without asking the database', async () => {
    expect([...(await permissionsOf({ id: 'a', role: 'ADMIN' }))].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
  it('students and parent accounts have none (roles are for staff)', async () => {
    expect((await permissionsOf({ id: 's', role: 'STUDENT' })).size).toBe(0);
    expect((await permissionsOf({ id: 'g', role: 'GUARDIAN' })).size).toBe(0);
  });
});
