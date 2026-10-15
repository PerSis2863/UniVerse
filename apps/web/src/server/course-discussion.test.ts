import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ default: {} }));
vi.mock('./tutor', () => ({ coursePassages: vi.fn() }));
vi.mock('./gemini', () => ({ geminiJson: vi.fn() }));
vi.mock('./ai-budget', () => ({ spendAi: vi.fn() }));
vi.mock('./email', () => ({ notify: vi.fn() }));
vi.mock('./realtime', () => ({ publish: vi.fn() }));

import { authorFor } from './course-discussion';

const viewer = (id: string, canManage = false) => ({ user: { id, name: 'X', email: 'x@x', role: canManage ? 'TEACHER' : 'STUDENT' }, canManage, teacherId: 'teacher' });
const student = { id: 'asha', name: 'Asha Rao', avatar: '/a.png', role: 'STUDENT' };

describe('discussion authors', () => {
  it('hides an anonymous student from classmates only', () => {
    expect(authorFor(viewer('bo'), student, true)).toEqual({ id: null, name: 'Anonymous classmate', avatar: null, staff: false, mine: false, anonymous: true });
    // The teacher always sees who it is; so does the student who wrote it.
    expect(authorFor(viewer('teacher', true), student, true)).toMatchObject({ id: 'asha', name: 'Asha Rao', anonymous: true });
    expect(authorFor(viewer('asha'), student, true)).toMatchObject({ id: 'asha', mine: true, anonymous: true });
    expect(authorFor(viewer('bo'), student, false)).toMatchObject({ id: 'asha', name: 'Asha Rao', anonymous: false, staff: false });
  });

  it('marks the teacher and never hides staff', () => {
    expect(authorFor(viewer('bo'), { id: 'teacher', name: 'Dr. Smith', avatar: null, role: 'TEACHER' }, true)).toMatchObject({ id: 'teacher', staff: true });
    expect(authorFor(viewer('bo'), { id: 'adm', name: 'Admin', avatar: null, role: 'ADMIN' }, false)).toMatchObject({ staff: true });
  });
});
