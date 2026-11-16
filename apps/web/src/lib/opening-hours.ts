// OpenStreetMap's opening_hours, the common part of it (M209): "Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off",
// "24/7", "Tu-Su 10:00-18:00", "Mo,We 10:00-12:00,14:00-18:00", "Fr-Sa 18:00-02:00". A later rule for a
// day replaces an earlier one, as OSM means. Rules with months, dates, holidays, sunrise or week numbers
// aren't read: the place then says only its written hours (`sure: false`), never a wrong "Open".

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export type Week = [number, number][][]; // per day (Monday 0): [opens, closes] in minutes; closes may pass 1440

function days(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1]), b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; }
  }
  return [...out];
}
function times(spec: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    let b = Number(m[3]) * 60 + Number(m[4]);
    if (b <= a) b += 1440; // past midnight
    out.push([a, b]);
  }
  return out;
}

/** The week's hours, and whether every rule was understood. */
export function readHours(raw: string | null | undefined): { week: Week; sure: boolean } | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (text === '24/7') return { week: Array.from({ length: 7 }, () => [[0, 1440]] as [number, number][]), sure: true };
  const week: Week = Array.from({ length: 7 }, () => []);
  let sure = true, any = false;
  for (const rule of text.split(/\s*(?:;|\|\|)\s*/).filter(Boolean)) {
    if (/\bPH\b|\bSH\b/.test(rule) && !/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(rule)) continue; // holidays only
    const r = rule.replace(/,\s*PH\b|\bPH\s*,/g, '').trim();
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(r);
    const ds = m?.[1] ? days(m[1]) : [0, 1, 2, 3, 4, 5, 6], rest = (m?.[2] ?? '').trim();
    if (!ds) { sure = false; continue; }
    if (/^(off|closed)$/i.test(rest)) { for (const d of ds) week[d] = []; any = true; continue; }
    const ts = times(rest);
    if (!ts) { sure = false; continue; }
    for (const d of ds) week[d] = ts;
    any = true;
  }
  return any ? { week, sure } : null;
}

const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Open now? With when it closes, or when it next opens (day of the week, Monday 0, and time). */
export function openState(week: Week, day: number, minutes: number): { open: boolean; until?: string; next?: { day: number; at: string } } {
  // Yesterday's hours that run past midnight count today.
  const prev = week[(day + 6) % 7].find(([, b]) => b > 1440 && minutes < b - 1440);
  if (prev) return { open: true, until: hhmm(prev[1]) };
  const now = week[day].find(([a, b]) => minutes >= a && minutes < b);
  if (now) return { open: true, until: now[1] === 1440 ? '24:00' : hhmm(now[1]) };
  for (let k = 0; k < 7; k++) {
    const d = (day + k) % 7, start = week[d].map(([a]) => a).filter((a) => k > 0 || a > minutes).sort((x, y) => x - y)[0];
    if (start !== undefined) return { open: false, next: { day: d, at: hhmm(start) } };
  }
  return { open: false };
}

/** A day's hours as words: "08:00–21:00", "10:00–12:00, 14:00–18:00" or "Closed". */
export const dayText = (week: Week, day: number) => (week[day].length ? week[day].map(([a, b]) => `${hhmm(a)}–${b === 1440 ? '24:00' : hhmm(b)}`).join(', ') : 'Closed');
