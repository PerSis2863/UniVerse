// M222: how the notifications panel (NotificationsPanel.tsx) lays its list out, the way iOS does: dated "now", "5m
// ago", "3h ago", then the date; grouped Today, Yesterday, Earlier; the same notification several times in a row
// kept together as one stack.

/** "now", "5m", "3h", "2d", then the date: the way iOS dates a notification. */
export function when(at: string, now: number) {
  const t = new Date(at).getTime(), mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  if (mins < 7 * 24 * 60) return `${Math.round(mins / 1440)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Today, Yesterday, Earlier: the groups iOS shows, in that order, empty ones left out. */
export function byDay<T extends { createdAt: string }>(notes: T[], now: number) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const today = midnight.getTime(), yesterday = today - 86_400_000;
  const groups: { label: string; notes: T[] }[] = [{ label: 'Today', notes: [] }, { label: 'Yesterday', notes: [] }, { label: 'Earlier', notes: [] }];
  for (const n of notes) { const t = new Date(n.createdAt).getTime(); groups[t >= today ? 0 : t >= yesterday ? 1 : 2].notes.push(n); }
  return groups.filter((g) => g.notes.length);
}

/** Notifications that say the same thing one after another (the same title and kind), kept together: iOS stacks them. */
export function stacks<T extends { type: string; title: string }>(notes: T[]): T[][] {
  const out: T[][] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && last[0].title === n.title && last[0].type === n.type) last.push(n); else out.push([n]);
  }
  return out;
}

