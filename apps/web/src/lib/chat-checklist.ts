// M340 (the owner, 19 Nov: shared checklists in Messages): a checklist posted into a chat. Everyone in the chat ticks
// items; each tick keeps who ticked it and when. Kept in the message's metadata (like a poll's options), changed only
// through POST /api/chat/messages/:id/check.

export interface CheckItem { text: string; done: { by: string; name: string; at: string } | null }
export interface Checklist { title: string; items: CheckItem[] }

export const MAX_ITEMS = 30;

/** A new checklist from what was typed, or an error to show. */
export function newChecklist(raw: unknown): Checklist | { error: string } {
  const b = (raw ?? {}) as { title?: unknown; items?: unknown };
  const title = String(b.title ?? '').trim().slice(0, 120);
  const items = Array.isArray(b.items) ? [...new Set(b.items.map((x) => String(x ?? '').trim().slice(0, 160)).filter(Boolean))] : [];
  if (!title) return { error: 'Give the checklist a title.' };
  if (!items.length || items.length > MAX_ITEMS) return { error: `A checklist needs 1–${MAX_ITEMS} items.` };
  return { title, items: items.map((text) => ({ text, done: null })) };
}

/** The checklist with item `i` ticked by this person, or unticked; null if `i` isn't one of its items. */
export function toggleItem(list: Checklist, i: number, who: { id: string; name: string }, now = new Date()): Checklist | null {
  if (!Number.isInteger(i) || i < 0 || i >= (list.items?.length ?? 0)) return null;
  const items = list.items.map((it, k) => (k !== i ? it : { ...it, done: it.done ? null : { by: who.id, name: who.name.split(' ')[0] ?? who.name, at: now.toISOString() } }));
  return { ...list, items };
}

/** "3 of 5 done", for the chat list and notifications. */
export const progress = (list: Checklist) => `${list.items.filter((i) => i.done).length} of ${list.items.length} done`;
