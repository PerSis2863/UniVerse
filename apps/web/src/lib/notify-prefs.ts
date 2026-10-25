import { localTime } from './home-time';
import { dayIn } from './study-days';

// Notification settings (Stage 5 · Q9): for each kind of notification, whether it comes as a push
// to my phone, waits for my daily summary, or only shows in the app; courses I've muted (their
// pushes wait for the summary); and the summary's time. Pure, so the push service, the settings
// page and the notification centre agree.

export type NoteGroupId = 'mentions' | 'messages' | 'grades' | 'calls' | 'tasks' | 'school' | 'impact' | 'other';
export type PushMode = 'push' | 'digest' | 'off';

export interface NoteGroup { id: NoteGroupId; label: string; hint: string; /** Notification `type`s in the group. */ types: string[]; /** Push tags (or their start) in the group. */ tags: string[] }

export const NOTE_GROUPS: NoteGroup[] = [
  { id: 'mentions', label: 'Mentions', hint: 'Someone @mentions you in a chat, document or board.', types: ['mention'], tags: ['mention-'] },
  { id: 'messages', label: 'Messages', hint: 'New chat messages and replies.', types: ['chat'], tags: ['chat-', 'msg-', 'thread-'] },
  { id: 'grades', label: 'Grades and feedback', hint: 'Marks, feedback, report cards and certificates.', types: ['grade', 'report-card', 'credential', 'feedback'], tags: ['grade-', 'offline-quiz-', 'support-plan', 'follow-up-', 'credential-'] },
  { id: 'calls', label: 'Calls and meetings', hint: 'Scheduled calls starting, office hours and meetings. A call ringing for you always rings.', types: ['live', 'meeting', 'call'], tags: ['scheduled-', 'office-', 'meeting-', 'call-'] },
  { id: 'tasks', label: 'Tasks and reminders', hint: 'Reminders you set, tasks and deadlines.', types: ['reminder', 'task'], tags: ['remind-', 'task-', 'offline-work'] },
  { id: 'school', label: 'School', hint: 'Announcements, events, fees, forms, the library, staff news and job openings.', types: ['event', 'announcement', 'consent', 'library', 'registers', 'staff', 'admissions', 'application', 'guardian', 'warning', 'fees', 'job'], tags: ['consent-', 'fees-', 'pack-', 'cover-', 'campus-network', 'parent-week', 'safety-', 'job-'] },
  { id: 'impact', label: 'Relief, Green and Trace', hint: 'Someone coming to help, a request delivered, urgent needs near you, recalls and alerts from your brand.', types: ['relief', 'green', 'trace'], tags: ['relief-', 'green-', 'trace-'] },
  { id: 'other', label: 'Everything else', hint: 'Anything not in the groups above.', types: [], tags: [] },
];

export const GROUP_OF_TYPE = (type: string | null | undefined): NoteGroupId =>
  NOTE_GROUPS.find((g) => g.types.includes(String(type ?? '')))?.id ?? 'other';

/** The group a push belongs to, from its own kind or its tag. */
export function groupOfPush(p: { kind?: string | null; tag?: string | null }): NoteGroupId {
  if (p.kind && NOTE_GROUPS.some((g) => g.id === p.kind)) return p.kind as NoteGroupId;
  const tag = p.tag ?? '';
  return NOTE_GROUPS.find((g) => g.tags.some((t) => (t.endsWith('-') ? tag.startsWith(t) : tag === t)))?.id ?? 'other';
}

export interface NotifyPrefs {
  push: Record<NoteGroupId, PushMode>;
  /** Courses whose pushes wait for the daily summary. */
  muted: string[];
  /** The daily summary: on, and at which hour of my day (0–23). */
  digest: boolean;
  digestHour: number;
}

export const DEFAULT_PREFS: NotifyPrefs = {
  push: { mentions: 'push', messages: 'push', grades: 'push', calls: 'push', tasks: 'push', school: 'push', impact: 'push', other: 'push' },
  muted: [],
  digest: true,
  digestHour: 18,
};

const ID = /^[A-Za-z0-9_-]{4,40}$/;

export function cleanPrefs(raw: unknown): NotifyPrefs {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const push = { ...DEFAULT_PREFS.push };
  const given = (o.push && typeof o.push === 'object' ? o.push : {}) as Record<string, unknown>;
  for (const g of NOTE_GROUPS) { const m = given[g.id]; if (m === 'push' || m === 'digest' || m === 'off') push[g.id] = m; }
  const muted = Array.isArray(o.muted) ? [...new Set(o.muted.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, 60) : [];
  const hour = Math.round(Number(o.digestHour));
  return { push, muted, digest: o.digest === undefined ? DEFAULT_PREFS.digest : o.digest === true, digestHour: hour >= 0 && hour <= 23 ? hour : DEFAULT_PREFS.digestHour };
}

/** Pushes with a switch of their own (the morning brief, a parent's weekly summary, this summary). */
const OWN_SWITCH = ['daily-brief', 'parent-week', 'notify-digest', 'remind-cards'];

/** What happens to a push for this person: sent now, kept for the summary, or not sent. A call
 *  ringing always rings (quiet hours aside). */
export function pushDecision(prefs: NotifyPrefs, p: { kind?: string | null; tag?: string | null; courseId?: string | null; call?: boolean }): PushMode {
  if (p.call || OWN_SWITCH.includes(p.tag ?? '')) return 'push';
  const mode = prefs.push[groupOfPush(p)];
  if (mode === 'off') return 'off';
  if (p.courseId && prefs.muted.includes(p.courseId)) return prefs.digest ? 'digest' : 'off';
  return mode === 'digest' && !prefs.digest ? 'off' : mode;
}

/** The summary's words: "7 new: 3 grades, 2 from school, 2 more". */
export function digestText(counts: Partial<Record<NoteGroupId, number>>): { title: string; body: string } | null {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  if (!total) return null;
  const names: Record<NoteGroupId, [string, string]> = {
    mentions: ['mention', 'mentions'], messages: ['message', 'messages'], grades: ['grade or feedback', 'grades and feedback'], calls: ['call or meeting', 'calls and meetings'],
    tasks: ['reminder', 'reminders'], school: ['school update', 'school updates'], impact: ['Relief, Green or Trace update', 'Relief, Green and Trace updates'], other: ['other', 'others'],
  };
  const parts = (Object.entries(counts) as [NoteGroupId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${n} ${names[g][n === 1 ? 0 : 1]}`);
  return { title: `Your day: ${total} new notification${total === 1 ? '' : 's'}`, body: parts.slice(0, 4).join(', ') };
}

/** The next time it's `hour`:00 in this time zone, more than a minute after `from`. */
export function nextDigestAt(tz: string | undefined, hour: number, from = Date.now()): Date {
  for (let add = 0; add < 3; add++) {
    const at = localTime(dayIn(tz, new Date(from + add * 86_400_000)), `${String(hour).padStart(2, '0')}:00`, tz);
    if (at != null && at > from + 60_000) return new Date(at);
  }
  return new Date(from + 86_400_000);
}
