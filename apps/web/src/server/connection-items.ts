import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, NotFoundException } from './http';
import { accessFor, SERVICES } from './connections';

// M182 / M200: what a connection shows, read live from the service with the person's own token (never
// stored here): the newest mail, recent Slack direct messages, calendar events, Google Classroom classes.

const MAX = 20;
const get = async <T>(url: string, token: string): Promise<T> => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) throw new BadRequestException('The connection stopped working. Connect it again.');
  if (!r.ok) throw new BadRequestException('The service didn’t answer. Try again in a moment.');
  return r.json() as Promise<T>;
};
const header = (hs: { name: string; value: string }[] | undefined, n: string) => hs?.find((h) => h.name.toLowerCase() === n)?.value ?? '';

export interface Mail { id: string; from: string; subject: string; snippet: string; at: string; link: string }
export interface Event { id: string; title: string; start: string; end: string; allDay: boolean; where: string | null; link: string | null }

/** GET /api/connections/:service/items[?from&to]: the service's newest things for me. */
export async function connectionItems(user: SessionUser, id: string, q: URLSearchParams) {
  const s = SERVICES[id];
  if (!s) throw new NotFoundException('That service isn’t here.');
  const token = await accessFor(user.id, id);
  if (!token) throw new NotFoundException(`${s.name} isn’t connected.`);
  if (id === 'gmail') return { mail: await gmail(token) };
  if (id === 'outlook') return { mail: await outlook(token) };
  if (id === 'slack') return { chats: await slack(token) };
  const from = q.get('from') ?? new Date().toISOString(), to = q.get('to') ?? new Date(Date.now() + 14 * 86_400_000).toISOString();
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new BadRequestException('Send from and to as dates.');
  if (id === 'google-calendar') return { events: await googleEvents(token, from, to) };
  if (id === 'outlook-calendar') return { events: await outlookEvents(token, from, to) };
  if (id === 'classroom') return { courses: await classroomCourses(token) };
  throw new NotFoundException('Nothing to show for that service.');
}

async function gmail(token: string): Promise<Mail[]> {
  const list = await get<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX}&labelIds=INBOX`, token);
  const rows = await Promise.all((list.messages ?? []).map((m) => get<{ id: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, token).catch(() => null)));
  return rows.filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({
    id: m.id, from: header(m.payload?.headers, 'from'), subject: header(m.payload?.headers, 'subject') || '(no subject)', snippet: m.snippet ?? '',
    at: new Date(Number(m.internalDate ?? 0)).toISOString(), link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
  }));
}

async function outlook(token: string): Promise<Mail[]> {
  const r = await get<{ value: { id: string; subject?: string; bodyPreview?: string; receivedDateTime: string; webLink?: string; from?: { emailAddress?: { name?: string; address?: string } } }[] }>(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${MAX}&$select=subject,from,receivedDateTime,bodyPreview,webLink&$orderby=receivedDateTime desc`, token);
  return r.value.map((m) => ({ id: m.id, from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '', subject: m.subject || '(no subject)', snippet: m.bodyPreview ?? '', at: m.receivedDateTime, link: m.webLink ?? 'https://outlook.office.com/mail/' }));
}

async function slack(token: string) {
  const ims = await get<{ ok: boolean; channels?: { id: string; user: string }[] }>('https://slack.com/api/conversations.list?types=im&limit=10', token);
  if (!ims.ok) throw new BadRequestException('The connection stopped working. Connect it again.');
  const rows = await Promise.all((ims.channels ?? []).slice(0, 10).map(async (c) => {
    const [h, u] = await Promise.all([
      get<{ messages?: { text?: string; ts: string }[] }>(`https://slack.com/api/conversations.history?channel=${c.id}&limit=1`, token).catch(() => null),
      get<{ user?: { real_name?: string; name?: string } }>(`https://slack.com/api/users.info?user=${c.user}`, token).catch(() => null),
    ]);
    const last = h?.messages?.[0];
    return last ? { id: c.id, with: u?.user?.real_name || u?.user?.name || 'Someone', last: (last.text ?? '').slice(0, 200), at: new Date(Number(last.ts) * 1000).toISOString(), link: `https://slack.com/app_redirect?channel=${c.id}` } : null;
  }));
  return rows.filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.at.localeCompare(a.at));
}

async function googleEvents(token: string, from: string, to: string): Promise<Event[]> {
  const q = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
  const r = await get<{ items?: { id: string; summary?: string; location?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, token);
  return (r.items ?? []).filter((e) => e.start && e.end).map((e) => ({ id: e.id, title: e.summary || '(busy)', start: e.start!.dateTime ?? e.start!.date!, end: e.end!.dateTime ?? e.end!.date!, allDay: !e.start!.dateTime, where: e.location ?? null, link: e.htmlLink ?? null }));
}

async function outlookEvents(token: string, from: string, to: string): Promise<Event[]> {
  const q = new URLSearchParams({ startDateTime: new Date(from).toISOString(), endDateTime: new Date(to).toISOString(), $top: '100', $select: 'subject,start,end,isAllDay,location,webLink', $orderby: 'start/dateTime' });
  const r = await get<{ value: { id: string; subject?: string; isAllDay?: boolean; webLink?: string; location?: { displayName?: string }; start: { dateTime: string }; end: { dateTime: string } }[] }>(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, token);
  // Graph gives UTC times without a "Z" unless asked otherwise.
  const utc = (t: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
  return r.value.map((e) => ({ id: e.id, title: e.subject || '(busy)', start: utc(e.start.dateTime), end: utc(e.end.dateTime), allDay: !!e.isAllDay, where: e.location?.displayName || null, link: e.webLink ?? null }));
}

async function classroomCourses(token: string) {
  const r = await get<{ courses?: { id: string; name: string; section?: string; courseState?: string; alternateLink?: string }[] }>('https://classroom.googleapis.com/v1/courses?teacherId=me&courseStates=ACTIVE&pageSize=50', token);
  return (r.courses ?? []).map((c) => ({ id: c.id, name: c.name, section: c.section ?? null, link: c.alternateLink ?? null }));
}

/**
 * POST /api/connections/classroom/import { courseId } (M200): one of my Google Classroom classes becomes a
 * UniVersity course (a draft, mine): its coursework becomes assignments (title, instructions, due date),
 * and its students who already have an account at my school are enrolled. Everyone else joins with the
 * course's invite link (M113). Nothing is sent to anyone.
 */
export async function importClassroom(user: SessionUser, b: Record<string, unknown>) {
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') throw new BadRequestException('Only teachers import classes.');
  const gid = typeof b.courseId === 'string' && /^\d{1,30}$/.test(b.courseId) ? b.courseId : '';
  if (!gid) throw new BadRequestException('Pick one of your classes.');
  const token = await accessFor(user.id, 'classroom');
  if (!token) throw new NotFoundException('Google Classroom isn’t connected.');
  type Students = { students?: { profile?: { emailAddress?: string } }[]; nextPageToken?: string };
  const [course, work, roster] = await Promise.all([
    get<{ id: string; name: string; section?: string; descriptionHeading?: string; description?: string }>(`https://classroom.googleapis.com/v1/courses/${gid}`, token),
    get<{ courseWork?: { title: string; description?: string; maxPoints?: number; dueDate?: { year: number; month: number; day: number }; dueTime?: { hours?: number; minutes?: number }; workType?: string; state?: string }[] }>(`https://classroom.googleapis.com/v1/courses/${gid}/courseWork?pageSize=60`, token).catch(() => ({ courseWork: [] })),
    get<Students>(`https://classroom.googleapis.com/v1/courses/${gid}/students?pageSize=300`, token).catch((): Students => ({ students: [] })),
  ]);
  const { default: prisma } = await import('@/lib/db');
  const { orgIn } = await import('./school-scope');
  // A code of its own: the section or the name's initials, made unique.
  const stem = (course.section || course.name).replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8) || 'CLASS';
  let code = stem;
  for (let i = 2; await prisma.course.findUnique({ where: { code }, select: { id: true } }); i++) code = `${stem}${i}`.slice(0, 12);
  const made = await prisma.course.create({ data: { code, name: course.name.slice(0, 120), description: (course.description ?? course.descriptionHeading ?? '').slice(0, 2000) || null, teacherId: user.id, status: 'DRAFT' }, select: { id: true, code: true, name: true } });
  const items = (work.courseWork ?? []).filter((w) => w.state !== 'DELETED' && (w.workType ?? 'ASSIGNMENT') === 'ASSIGNMENT').slice(0, 60);
  const due = (w: (typeof items)[number]) => (w.dueDate ? new Date(Date.UTC(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day, w.dueTime?.hours ?? 23, w.dueTime?.minutes ?? 59)) : null);
  // (D1 takes at most 100 values a statement: about 10 per assignment row, 4 per enrolment row.)
  const rows = items.map((w) => ({ courseId: made.id, createdById: user.id, title: w.title.slice(0, 200), instructions: (w.description ?? '').slice(0, 20_000) || w.title.slice(0, 200), rubric: [], maxScore: Math.max(1, Math.min(1000, Math.round(w.maxPoints ?? 100))), dueDate: due(w) }));
  for (let i = 0; i < rows.length; i += 8) await prisma.assignment.createMany({ data: rows.slice(i, i + 8) });
  const emails = [...new Set((roster.students ?? []).map((s) => s.profile?.emailAddress?.trim().toLowerCase()).filter((e): e is string => !!e))];
  let enrolled = 0;
  for (let i = 0; i < emails.length; i += 90) {
    const people = await prisma.user.findMany({ where: { email: { in: emails.slice(i, i + 90) }, role: 'STUDENT', ...orgIn([user.organizationId ?? null]) }, select: { id: true } });
    for (let j = 0; j < people.length; j += 20) enrolled += (await prisma.enrollment.createMany({ data: people.slice(j, j + 20).map((p) => ({ studentId: p.id, courseId: made.id })) })).count;
  }
  return { course: made, assignments: items.length, students: emails.length, enrolled };
}
