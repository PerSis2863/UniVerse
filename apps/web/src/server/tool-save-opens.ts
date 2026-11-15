import prisma from '@/lib/db';
import { ownerNames } from './owner-names';

// M194: Create work opened from someone else's link shows on the opener's Collaborate home ("Shared
// with me") for as long as that link works. Stopping the link, or deleting the work, takes it away.

const HOUR = 3_600_000;
const iso = (d: Date) => d.toISOString().replace('Z', '+00:00');

/**
 * A signed-in person opened this link to the work (not their own). The view page asks again every 20
 * seconds, so the row is written at most once an hour unless the link changed; an edit link they still
 * have outranks a view one.
 */
export async function noteOpen(saveId: string, ownerId: string, userId: string, token: string, mode: 'view' | 'edit') {
  if (ownerId === userId) return;
  const now = new Date();
  const keepEdit = `tool_save_opens."mode" = 'edit' AND excluded."mode" = 'view' AND EXISTS (SELECT 1 FROM tool_saves s WHERE s."id" = tool_save_opens."saveId" AND s."editToken" = tool_save_opens."token")`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO tool_save_opens ("saveId", "userId", "mode", "token", "openedAt") VALUES (?, ?, ?, ?, ?)
     ON CONFLICT ("saveId", "userId") DO UPDATE SET "openedAt" = excluded."openedAt",
       "mode" = CASE WHEN ${keepEdit} THEN tool_save_opens."mode" ELSE excluded."mode" END,
       "token" = CASE WHEN ${keepEdit} THEN tool_save_opens."token" ELSE excluded."token" END
     WHERE tool_save_opens."openedAt" < ? OR (tool_save_opens."token" <> excluded."token" AND NOT (${keepEdit}))`,
    saveId, userId, mode, token, iso(now), iso(new Date(now.getTime() - HOUR)),
  ).catch((e) => console.error('noting a shared link failed:', e));
}

/** The work others shared with me that I opened, newest first, while the link I opened still works. */
export async function openedByMe(userId: string) {
  const rows = await prisma.toolSaveOpen.findMany({
    where: { userId }, orderBy: { openedAt: 'desc' }, take: 60,
    select: { mode: true, token: true, save: { select: { id: true, tool: true, title: true, updatedAt: true, userId: true, shareToken: true, editToken: true } } },
  });
  const live = rows.flatMap(({ mode, token, save: s }) => {
    const edit = mode === 'edit';
    if (token !== (edit ? s.editToken : s.shareToken)) return [];
    return [{ id: s.id, tool: s.tool, title: s.title, updatedAt: s.updatedAt, ownerId: s.userId, edit, href: edit ? `/studio?edit=${token}` : `/s/${token}` }];
  });
  const by = await ownerNames(live.map((s) => s.ownerId), userId);
  return live.map(({ ownerId, ...s }) => ({ ...s, by: by.get(ownerId) ?? null }));
}
