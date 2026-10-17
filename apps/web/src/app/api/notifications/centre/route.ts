import { route } from '@/server/assignments';
import { actOnNotifications, listNotifications } from '@/server/notify-settings';

// The notification centre (Stage 5 · Q9, src/server/notify-settings.ts).
// GET ?group=&before=&unread=1: a page of my notifications (snoozed ones hidden) and unread counts.
// POST { action: read | unread | snooze | delete, ids?, all?, until? }.
export const GET = (req: Request) => route(req, (user) => {
  const sp = new URL(req.url).searchParams;
  return listNotifications(user, { group: sp.get('group'), before: sp.get('before'), unread: sp.get('unread') === '1' });
});
export const POST = (req: Request) => route(req, async (user) => actOnNotifications(user, (await req.json().catch(() => ({}))) ?? {}));
