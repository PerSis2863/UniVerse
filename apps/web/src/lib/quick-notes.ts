// Quick notes' text (Collaborate → Create → Quick notes; M90 after Apple Notes). A note stays plain text:
// its first line is the title, every other line a paragraph, and a line starting "[ ] " or "[x] " a
// checklist item. Kept as text, so older notes, saved copies and live editing open unchanged.

export interface Note { id: string; text: string; pinned: boolean; colour: number; at: number; folder?: string; deletedAt?: number }
export interface Line { text: string; check: boolean | null }

const CHECK = /^\[( |x)\]\s?/;
const toLine = (s: string): Line => { const m = CHECK.exec(s); return m ? { text: s.slice(m[0].length), check: m[1] === 'x' } : { text: s, check: null }; };

/** A note's title (its first line, without a tick box) and its other lines. */
export function parseNote(text: string): { title: string; lines: Line[] } {
  const [first = '', ...rest] = text.split('\n');
  return { title: first.replace(CHECK, ''), lines: rest.map(toLine) };
}
export const joinNote = (title: string, lines: Line[]) => [title, ...lines.map((l) => (l.check === null ? l.text : `[${l.check ? 'x' : ' '}] ${l.text}`))].join('\n');
/** Pasted text with line breaks, as lines (tick boxes kept). */
export const linesOf = (s: string) => s.split('\n').map(toLine);
export const noteTitle = (n: Pick<Note, 'text'>) => parseNote(n.text).title.trim() || 'New note';
export const notePreview = (n: Pick<Note, 'text'>) => parseNote(n.text).lines.map((l) => l.text.trim()).find(Boolean) ?? '';
/** "2/5" for a note with a checklist (ticked of all), else null. */
export function checklistDone(text: string) {
  const items = parseNote(text).lines.filter((l) => l.check !== null);
  return items.length ? `${items.filter((l) => l.check).length}/${items.length}` : null;
}

const DAY = 86_400_000;
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** The list's heading for a note last changed at `at`, as Apple Notes groups them. */
export function dateGroup(at: number, now: number): string {
  const today = startOfDay(now);
  if (at >= today) return 'Today';
  if (at >= today - DAY) return 'Yesterday';
  if (at >= today - 7 * DAY) return 'Previous 7 days';
  if (at >= today - 30 * DAY) return 'Previous 30 days';
  const d = new Date(at);
  return d.getFullYear() === new Date(now).getFullYear() ? d.toLocaleString(undefined, { month: 'long' }) : String(d.getFullYear());
}
/** The time in a note's row: the time today, "Yesterday", the weekday this week, else the date. */
export function rowTime(at: number, now: number): string {
  const g = dateGroup(at, now), d = new Date(at);
  if (g === 'Today') return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (g === 'Yesterday') return g;
  if (g === 'Previous 7 days') return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString();
}

/** Deleted notes wait this long in Recently deleted, then go for good. */
export const KEEP_DELETED = 30 * DAY;
export const daysLeft = (deletedAt: number, now: number) => Math.max(0, Math.ceil((deletedAt + KEEP_DELETED - now) / DAY));

/** Apple's "Move ticked items to the bottom": in each run of checklist lines, ticked ones go last. */
export function tickedDown(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < lines.length;) {
    if (lines[i].check === null) { out.push(lines[i++]); continue; }
    const run: Line[] = [];
    while (i < lines.length && lines[i].check !== null) run.push(lines[i++]);
    out.push(...run.filter((l) => !l.check), ...run.filter((l) => l.check));
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A note as a document: the title as a heading, tick boxes as a real checklist, "- " lines as a list. */
export function noteToHtml(text: string): string {
  const { title, lines } = parseNote(text);
  const out = title.trim() ? [`<h1>${esc(title.trim())}</h1>`] : [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (l.check !== null) {
      const items: string[] = [];
      for (; i < lines.length && lines[i].check !== null; i++) items.push(`<li data-type="taskItem" data-checked="${lines[i].check}"><label><input type="checkbox"${lines[i].check ? ' checked' : ''}></label><div><p>${esc(lines[i].text)}</p></div></li>`);
      out.push(`<ul data-type="taskList">${items.join('')}</ul>`);
    } else if (/^\s*[-*•]\s+/.test(l.text)) {
      const items: string[] = [];
      for (; i < lines.length && lines[i].check === null && /^\s*[-*•]\s+/.test(lines[i].text); i++) items.push(`<li><p>${esc(lines[i].text.replace(/^\s*[-*•]\s+/, ''))}</p></li>`);
      out.push(`<ul>${items.join('')}</ul>`);
    } else { out.push(`<p>${esc(l.text)}</p>`); i++; }
  }
  return out.join('');
}
