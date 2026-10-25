// The owner console's Launch board (src/server/owner-launch.ts): for each app, the real people who
// did something in the last 30 days, how many of them are new this week, and how many came back on
// another day. Rows are (person, when) pairs of real actions; sample data is left out by the server.

const DAY = 86_400_000;

export interface LaunchApp { people: number; newThisWeek: number; cameBack: number; last: string | null }

/** Sums one app's actions per person. */
export function launchSummary(rows: { userId: string; at: number }[], now: number): LaunchApp {
  const by = new Map<string, { first: number; last: number; days: Set<string> }>();
  for (const r of rows) {
    if (!r.userId || !Number.isFinite(r.at)) continue;
    const p = by.get(r.userId) ?? { first: r.at, last: r.at, days: new Set<string>() };
    p.first = Math.min(p.first, r.at); p.last = Math.max(p.last, r.at);
    p.days.add(new Date(r.at).toISOString().slice(0, 10));
    by.set(r.userId, p);
  }
  const people = [...by.values()];
  const last = people.reduce((m, p) => Math.max(m, p.last), 0);
  return {
    people: people.length,
    newThisWeek: people.filter((p) => p.first > now - 7 * DAY).length,
    cameBack: people.filter((p) => p.days.size > 1).length,
    last: last ? new Date(last).toISOString() : null,
  };
}

/** Everyone who did something in any app, and who came back on another day in any of them. */
export function launchTotal(rows: { userId: string; at: number }[]) {
  const days = new Map<string, Set<string>>();
  for (const r of rows) if (r.userId && Number.isFinite(r.at)) days.set(r.userId, (days.get(r.userId) ?? new Set()).add(new Date(r.at).toISOString().slice(0, 10)));
  return { people: days.size, cameBack: [...days.values()].filter((d) => d.size > 1).length };
}
