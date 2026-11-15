import { describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/db';
import { noteOpen, openedByMe } from './tool-save-opens';

// M194: work opened from someone's link is listed only while that very link works, and never the owner's own.

vi.mock('@/lib/db', () => ({ default: { toolSaveOpen: { findMany: vi.fn() }, user: { findMany: vi.fn(async () => [{ id: 'tara', name: 'Tara Teacher' }]) }, $executeRawUnsafe: vi.fn(async () => 1) } }));
const db = prisma as unknown as { toolSaveOpen: { findMany: ReturnType<typeof vi.fn> }; $executeRawUnsafe: ReturnType<typeof vi.fn> };
const save = (shareToken: string | null, editToken: string | null) => ({ id: 's1', tool: 'mindmap', title: 'Map', updatedAt: new Date(), userId: 'tara', shareToken, editToken });

describe('shared Create work on Home', () => {
  it('lists the link I opened while it still works', async () => {
    db.toolSaveOpen.findMany.mockResolvedValue([{ mode: 'view', token: 'v1', save: save('v1', null) }]);
    expect(await openedByMe('alice')).toMatchObject([{ id: 's1', edit: false, href: '/s/v1', by: 'Tara Teacher' }]);
  });
  it('drops it when that link was stopped, even if a new one was made', async () => {
    db.toolSaveOpen.findMany.mockResolvedValue([{ mode: 'view', token: 'v1', save: save('v2', null) }, { mode: 'edit', token: 'e1', save: save('v1', 'e2') }]);
    expect(await openedByMe('alice')).toEqual([]);
  });
  it('never records the owner opening their own link', async () => {
    db.$executeRawUnsafe.mockClear();
    await noteOpen('s1', 'tara', 'tara', 'v1', 'view');
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
