import { keywords } from './second-chance';

// Whisper TA (Stage 5 · D2): the pure parts. A student's browser keeps the last minutes of the
// class's captions to send with a question, and the teacher sees questions grouped by topic, with
// how many students asked (never who, never the question itself).

/** How far back the TA reads what was said. */
export const HEARD_MS = 10 * 60_000;
/** How much of it at most (the newest is kept). */
export const HEARD_CHARS = 8_000;

export interface HeardLine { at: number; who: string; text: string }
/** A line as sent with a question: seconds ago rather than a clock time (the clocks may differ). */
export interface SentLine { ago: number; who: string; text: string }

/** The last ten minutes, newest kept when there's too much, oldest first. */
export function recentHeard(lines: HeardLine[], now: number): SentLine[] {
  const out: SentLine[] = [];
  let chars = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (now - l.at > HEARD_MS) break;
    chars += l.text.length + l.who.length;
    if (chars > HEARD_CHARS) break;
    out.push({ ago: Math.max(0, Math.round((now - l.at) / 1000)), who: l.who, text: l.text });
  }
  return out.reverse();
}

/** What a request says was heard, made safe to put in a prompt: bounded, oldest first. */
export function cleanHeard(raw: unknown): SentLine[] {
  if (!Array.isArray(raw)) return [];
  const lines = raw.slice(-200).flatMap((x) => {
    const l = (x ?? {}) as Record<string, unknown>;
    const ago = Number(l.ago);
    const text = typeof l.text === 'string' ? l.text.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    const who = typeof l.who === 'string' ? l.who.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    return Number.isFinite(ago) && ago >= 0 && ago <= HEARD_MS / 1000 + 60 && text ? [{ ago: Math.round(ago), who: who || 'Someone', text }] : [];
  });
  const kept: SentLine[] = [];
  let chars = 0;
  for (const l of [...lines].sort((a, b) => a.ago - b.ago)) {
    chars += l.text.length + l.who.length;
    if (chars > HEARD_CHARS) break;
    kept.push(l);
  }
  return kept.sort((a, b) => b.ago - a.ago);
}

/** The heard lines as prompt text: "[4 min ago] Dr Smith: …". */
export function heardText(lines: SentLine[]) {
  return lines.map((l) => `[${l.ago < 60 ? 'just now' : `${Math.round(l.ago / 60)} min ago`}] ${l.who}: ${l.text}`).join('\n');
}

export interface Asked { topic: string | null; studentId: string; at: number }
export interface Cluster { topic: string; students: number; questions: number; latest: number; topics: string[] }

/** Questions grouped by topic: labels sharing enough key words are one group ("base case" and "base cases in recursion"). Most students first. */
export function clusterTopics(items: Asked[]): Cluster[] {
  const groups: { keys: string[]; labels: string[]; students: Set<string>; questions: number; latest: number }[] = [];
  for (const it of [...items].sort((a, b) => a.at - b.at)) {
    const label = (it.topic ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const keys = keywords(label, 6);
    if (!label || !keys.length) continue;
    const g = groups.find((x) => {
      const shared = x.keys.filter((k) => keys.includes(k)).length;
      return shared >= Math.max(1, Math.ceil(Math.min(x.keys.length, keys.length) / 2));
    });
    if (g) { g.labels.push(label); g.students.add(it.studentId); g.questions++; g.latest = Math.max(g.latest, it.at); }
    else groups.push({ keys, labels: [label], students: new Set([it.studentId]), questions: 1, latest: it.at });
  }
  return groups.map((g) => {
    // The label used most names the group; on a tie, the shortest.
    const counts = new Map<string, number>();
    for (const l of g.labels) counts.set(l.toLowerCase(), (counts.get(l.toLowerCase()) ?? 0) + 1);
    const best = [...new Set(g.labels)].sort((a, b) => (counts.get(b.toLowerCase()) ?? 0) - (counts.get(a.toLowerCase()) ?? 0) || a.length - b.length)[0];
    return { topic: best, students: g.students.size, questions: g.questions, latest: g.latest, topics: [...new Set(g.labels.map((l) => l.toLowerCase()))] };
  }).sort((a, b) => b.students - a.students || b.latest - a.latest);
}
