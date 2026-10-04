import { randomBytes } from 'node:crypto';
import prisma from '@/lib/db';
import { APP_URL, escapeHtml, sendEmail } from './email';
import { BadRequestException, HttpException, NotFoundException } from './http';
import { issueGuardianToken, shareLinksEnabled } from './share-tokens';
import { studentProgress } from './student-progress';

// Parents and guardians a student keeps informed: a weekly progress email and an email when
// they're marked absent. The student adds them; nothing is sent until the guardian confirms
// from the first email (so the feature can't be used to email strangers), and every email
// has a link to change or stop the updates. Students can remove a guardian at any time.

/** Off unless GUARDIAN_EMAILS=on: every part of this feature is email, and the Resend plan's
 *  allowance is small (src/server/email-budget.ts). */
export const guardianEmailsEnabled = () => process.env.GUARDIAN_EMAILS?.trim().toLowerCase() === 'on';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_CONTACTS = 3;
const WEEK_MS = 6.5 * 86_400_000; // a little under a week, so the daily job never skips one

const PUBLIC = { id: true, email: true, name: true, confirmedAt: true, weeklyDigest: true, absenceAlerts: true, lastDigestAt: true, createdAt: true } as const;

function frame(title: string, body: string, token: string, button?: { href: string; label: string }) {
  const manage = `${APP_URL()}/guardian/updates/${token}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:32px">
<tr><td style="font-size:17px;font-weight:700;color:#18181b">UniVerse <span style="color:#6366f1">Impact</span></td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:700;color:#18181b">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.55;color:#3f3f46">${body}</td></tr>
${button ? `<tr><td style="padding-top:24px"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:10px">${escapeHtml(button.label)}</a></td></tr>` : ''}
<tr><td style="padding-top:24px;font-size:12px;color:#a1a1aa">You get this because a student added your address on UniVerse Impact. <a href="${escapeHtml(manage)}" style="color:#6366f1">Change or stop these emails</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { html, manage };
}

const text = (html: string) => html.replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|li|tr|h\d)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

// ─── Student side ───────────────────────────────────────────────────────────────────────────────

export function listContacts(studentId: string) {
  return prisma.guardianContact.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' }, select: PUBLIC });
}

export async function addContact(student: { id: string; name: string }, body: Record<string, unknown>) {
  if (!guardianEmailsEnabled()) throw new HttpException('Guardian emails aren’t switched on for this school yet.', 503);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  if (!EMAIL_RE.test(email)) throw new BadRequestException('Enter a valid email address.');
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null;
  const count = await prisma.guardianContact.count({ where: { studentId: student.id } });
  if (count >= MAX_CONTACTS) throw new BadRequestException(`You can add up to ${MAX_CONTACTS} parents or guardians.`);
  if (await prisma.guardianContact.findUnique({ where: { studentId_email: { studentId: student.id, email } } })) throw new BadRequestException('That address is already on your list.');
  const contact = await prisma.guardianContact.create({
    data: { studentId: student.id, email, name, token: randomBytes(24).toString('base64url'), weeklyDigest: body.weeklyDigest !== false, absenceAlerts: body.absenceAlerts !== false },
  });
  const who = escapeHtml(student.name);
  const { html } = frame(
    `${student.name} would like to keep you updated`,
    `<p>${who} added you as a parent or guardian on UniVerse Impact, their school platform.</p><p>If you confirm, you'll get a short weekly email with their grades, attendance and what's due, and an email if they're marked absent. You can stop at any time.</p><p>If you don't know ${who}, ignore this email and nothing more will be sent.</p>`,
    contact.token,
    { href: `${APP_URL()}/guardian/updates/${contact.token}`, label: 'Confirm updates' },
  );
  const sent = await sendEmail(email, `${student.name} added you on UniVerse Impact`, html, text(html));
  return { contact: { ...contact, token: undefined }, emailSent: sent };
}

export async function updateContact(studentId: string, id: string, body: Record<string, unknown>) {
  const data: { weeklyDigest?: boolean; absenceAlerts?: boolean; name?: string | null } = {};
  if (typeof body.weeklyDigest === 'boolean') data.weeklyDigest = body.weeklyDigest;
  if (typeof body.absenceAlerts === 'boolean') data.absenceAlerts = body.absenceAlerts;
  if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 80) || null;
  const res = await prisma.guardianContact.updateMany({ where: { id, studentId }, data });
  if (!res.count) throw new NotFoundException('Not found.');
  return prisma.guardianContact.findUnique({ where: { id }, select: PUBLIC });
}

export async function removeContact(studentId: string, id: string) {
  const res = await prisma.guardianContact.deleteMany({ where: { id, studentId } });
  if (!res.count) throw new NotFoundException('Not found.');
  return { ok: true };
}

// ─── Guardian side (the link in their emails) ──────────────────────────────────────────────────

export async function contactByToken(token: string) {
  const c = await prisma.guardianContact.findUnique({ where: { token }, select: { ...PUBLIC, student: { select: { name: true } } } });
  if (!c) throw new NotFoundException('This link is no longer valid. The student may have removed you.');
  return { student: c.student.name, email: c.email, confirmed: !!c.confirmedAt, weeklyDigest: c.weeklyDigest, absenceAlerts: c.absenceAlerts };
}

export async function actOnToken(token: string, body: Record<string, unknown>) {
  const c = await prisma.guardianContact.findUnique({ where: { token }, select: { id: true } });
  if (!c) throw new NotFoundException('This link is no longer valid.');
  if (body.action === 'stop') {
    await prisma.guardianContact.delete({ where: { id: c.id } });
    return { stopped: true };
  }
  const data: { confirmedAt?: Date; weeklyDigest?: boolean; absenceAlerts?: boolean } = {};
  if (body.action === 'confirm') data.confirmedAt = new Date();
  if (typeof body.weeklyDigest === 'boolean') data.weeklyDigest = body.weeklyDigest;
  if (typeof body.absenceAlerts === 'boolean') data.absenceAlerts = body.absenceAlerts;
  await prisma.guardianContact.update({ where: { id: c.id }, data });
  return contactByToken(token);
}

// ─── Emails ─────────────────────────────────────────────────────────────────────────────────────

/** From the daily job: the weekly email for confirmed guardians whose last one is a week old. */
export async function sendWeeklyDigests(limit = 40) {
  if (!guardianEmailsEnabled()) return 0;
  const due = await prisma.guardianContact.findMany({
    where: { confirmedAt: { not: null }, weeklyDigest: true, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(Date.now() - WEEK_MS) } }] },
    orderBy: { lastDigestAt: 'asc' },
    take: limit,
    select: { id: true, email: true, token: true, studentId: true, student: { select: { name: true, status: true } } },
  });
  // Each student's progress is worked out once, even with two guardians.
  const progress = new Map<string, Awaited<ReturnType<typeof studentProgress>>>();
  let sent = 0;
  for (const c of due) {
    if (c.student.status !== 'ACTIVE') continue;
    if (!progress.has(c.studentId)) progress.set(c.studentId, await studentProgress(c.studentId, 7));
    const p = progress.get(c.studentId)!;
    const name = escapeHtml(c.student.name.split(' ')[0] || c.student.name);
    const rows = p.courses.map((co) => `<tr><td style="padding:6px 0;color:#18181b">${escapeHtml(co.code)} · ${escapeHtml(co.name)}</td><td align="right" style="padding:6px 0;color:#3f3f46">${co.grade === null ? '–' : `${co.grade}%`}</td><td align="right" style="padding:6px 0 6px 12px;color:#3f3f46">${co.attendance === null ? '–' : `${co.attendance}%`}</td></tr>`).join('');
    const dueSoon = p.deadlines.slice(0, 6).map((d) => `<li>${escapeHtml(d.title)}${d.course ? ` (${escapeHtml(d.course.code)})` : ''}, ${new Date(d.due).toUTCString().slice(0, 16)}</li>`).join('');
    const link = shareLinksEnabled() ? `${APP_URL()}/guardian/${issueGuardianToken(c.studentId, 7).token}` : null;
    const body = `<p>Here's ${name}'s week on UniVerse Impact.</p>
<p><b>Average grade:</b> ${p.average === null ? 'nothing graded yet' : `${p.average}%`} · <b>Attendance:</b> ${p.attendance === null ? 'not recorded yet' : `${p.attendance}%`}</p>
${rows ? `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:8px"><tr><td style="color:#a1a1aa;font-size:12px">Course</td><td align="right" style="color:#a1a1aa;font-size:12px">Grade</td><td align="right" style="color:#a1a1aa;font-size:12px;padding-left:12px">Attendance</td></tr>${rows}</table>` : ''}
${dueSoon ? `<p style="margin-top:16px"><b>Due in the next 7 days</b></p><ul style="padding-left:18px;margin:4px 0">${dueSoon}</ul>` : '<p style="margin-top:16px">Nothing is due in the next 7 days.</p>'}`;
    const { html } = frame(`${c.student.name}'s week`, body, c.token, link ? { href: link, label: 'See full progress' } : undefined);
    if (await sendEmail(c.email, `${c.student.name}'s week on UniVerse Impact`, html, text(html))) sent++;
    await prisma.guardianContact.update({ where: { id: c.id }, data: { lastDigestAt: new Date() } });
  }
  return sent;
}

/** A student was just marked absent (not before): their confirmed guardians who want alerts hear about it. */
export async function alertAbsence(studentId: string, courseId: string, date: string) {
  if (!guardianEmailsEnabled()) return 0;
  const [contacts, course, student] = await Promise.all([
    prisma.guardianContact.findMany({ where: { studentId, confirmedAt: { not: null }, absenceAlerts: true }, select: { email: true, token: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { code: true, name: true } }),
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true } }),
  ]);
  if (!contacts.length || !course || !student) return 0;
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  let sent = 0;
  for (const c of contacts) {
    const { html } = frame(
      `${student.name} was marked absent`,
      `<p>${escapeHtml(student.name)} was marked absent from <b>${escapeHtml(course.code)} · ${escapeHtml(course.name)}</b> on ${escapeHtml(day)}.</p><p>If you think this is a mistake, please contact the school.</p>`,
      c.token,
    );
    if (await sendEmail(c.email, `${student.name} was marked absent (${course.code})`, html, text(html))) sent++;
  }
  return sent;
}
