// The small calculations behind Collaborate → Home (M17): changes per day, the streak, what's due
// this week, and quick notes turned into a document. Days are the person's own (local) days.

const DAY = 86_400_000;
const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Whole local days from `a` to `b` (daylight saving changes don't shift it). */
const daysBetween = (a: number, b: number) => Math.round((midnight(b) - midnight(a)) / DAY);

/** How many items changed on each of the last `n` days, oldest first (the last is today). */
export function activityDays(at: string[], now: number, n = 28): number[] {
  const out = Array<number>(n).fill(0);
  for (const iso of at) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    const back = daysBetween(t, now);
    if (back >= 0 && back < n) out[n - 1 - back]++;
  }
  return out;
}

/** Days in a row with something, up to today (a quiet today doesn't break it yet). */
export function streakOf(days: number[]): number {
  let i = days.length - 1;
  if (i >= 0 && !days[i]) i--;
  let n = 0;
  for (; i >= 0 && days[i]; i--) n++;
  return n;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** My cards due today and the next six days, day by day, and how many are overdue. */
export function dueThisWeek<T extends { dueAt: string | null }>(tasks: T[], now: number) {
  const days = Array.from({ length: 7 }, (_, i) => ({ label: i === 0 ? 'Today' : WEEKDAY[new Date(midnight(now) + i * DAY + DAY / 2).getDay()], items: [] as T[] }));
  let overdue = 0;
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const due = Date.parse(t.dueAt);
    if (!Number.isFinite(due)) continue;
    if (due < now && daysBetween(due, now) > 0) { overdue++; continue; }
    const ahead = daysBetween(now, due);
    if (ahead >= 0 && ahead < 7) days[ahead].items.push(t);
  }
  return { days, overdue };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Quick notes as a document: a paragraph a line; "- " or "* " lines become a list. */
export function notesToHtml(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) out.push(`<ul>${list.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`); list = []; };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) { list.push(esc(item[1])); continue; }
    flush();
    out.push(`<p>${esc(line)}</p>`);
  }
  flush();
  return out.join('');
}
