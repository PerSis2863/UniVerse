// A call's agenda (Stage 5 · B8.3) and meeting templates (B8.2). The call room keeps the agenda
// (cloudflare/worker.ts CallAgenda); everyone works out the time left from the room's clock.

export interface AgendaItem { title: string; minutes: number; who: string | null }
export interface Agenda { items: AgendaItem[]; current: number | null; startedAt: number | null; by: string }

/** Where the agenda is at a moment (in the room's time). */
export function agendaClock(a: Agenda | null, now: number) {
  if (!a || a.current === null || a.startedAt === null || !a.items[a.current]) return null;
  const item = a.items[a.current];
  const elapsed = Math.max(0, Math.floor((now - a.startedAt) / 1000));
  const left = item.minutes * 60 - elapsed;
  return { index: a.current, item, elapsed, left, overrun: left < 0, soon: left >= 0 && left <= 60, next: a.items[a.current + 1] ?? null, last: a.current === a.items.length - 1 };
}

/** "4:05", or "1:02:00" for an hour or more (absolute; the caller says "over by"). */
export function clockText(sec: number) {
  const s = Math.abs(Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export const totalMinutes = (items: AgendaItem[]) => items.reduce((n, i) => n + i.minutes, 0);

export type MeetingTemplateId = 'class' | 'office' | 'parent' | 'interview' | 'viva';
export interface MeetingTemplate {
  id: MeetingTemplateId; name: string; hint: string;
  /** Settings the host's app turns on when the call starts. */
  lobby: boolean; notes: boolean; captions: boolean;
  agenda: AgendaItem[];
}
const item = (title: string, minutes: number, who: string | null = null): AgendaItem => ({ title, minutes, who });

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  { id: 'class', name: 'Class', hint: 'Starter, teaching, practice and a recap', lobby: false, notes: true, captions: false,
    agenda: [item('Welcome and starter', 5), item('Teaching', 20, 'Teacher'), item('Practice or group work', 20), item('Recap and questions', 10)] },
  { id: 'office', name: 'Office hours', hint: 'Short turns, one student at a time', lobby: true, notes: false, captions: false,
    agenda: [item('Student 1', 10), item('Student 2', 10), item('Student 3', 10)] },
  { id: 'parent', name: 'Parent meeting', hint: 'Progress, concerns and next steps, with notes', lobby: true, notes: true, captions: true,
    agenda: [item('Welcome', 2), item('How things are going', 8, 'Teacher'), item('Questions and concerns', 8, 'Parent'), item('Agreed next steps', 5)] },
  { id: 'interview', name: 'Interview', hint: 'Introductions, questions and the candidate’s questions', lobby: true, notes: true, captions: false,
    agenda: [item('Introductions', 5), item('Questions', 25, 'Panel'), item('Candidate’s questions', 10, 'Candidate'), item('Next steps', 5)] },
  { id: 'viva', name: 'Viva or defence', hint: 'A timed presentation, then each examiner in turn', lobby: true, notes: true, captions: false,
    agenda: [item('Presentation', 20, 'Candidate'), item('Questions', 15, 'Examiner 1'), item('Questions', 15, 'Examiner 2'), item('Panel discussion (candidate waits)', 10, 'Panel'), item('Result and feedback', 10, 'Chair')] },
];
export const isMeetingTemplate = (x: unknown): x is MeetingTemplateId => MEETING_TEMPLATES.some((t) => t.id === x);
export const templateById = (id: string | null | undefined) => MEETING_TEMPLATES.find((t) => t.id === id) ?? null;
