import { heatOf } from '@/lib/activity-heat';

// M141: the activity log in "Explore with sample data": a made-up fortnight of what admins and
// teachers did, so the page's heatmap, tabs and log aren't empty.

const PEOPLE = [
  { id: 'smp-admin', name: 'Admin User', role: 'ADMIN', email: 'demo@admin.com' },
  { id: 'smp-tara', name: 'Tara Singh', role: 'TEACHER', email: 'tara@teacher.com' },
  { id: 'smp-tom', name: 'Tom Okafor', role: 'TEACHER', email: 'tom@teacher.com' },
];
const WHAT: [string, string][] = [
  ['grade.updated', 'Changed CS301 Midterm for Alice Johnson from 72 to 78'],
  ['user.role_changed', 'Made Bob Lee a teaching assistant'],
  ['credential.approved', 'Approved Alice Johnson’s Python certificate'],
  ['course.created', 'Created ENV210 Sustainable Development'],
  ['grade.published', 'Published the CS220 lab grades'],
  ['user.suspended', 'Suspended a spam account'],
  ['credential.rejected', 'Declined a certificate with an unreadable scan'],
  ['scholarship.requested', 'Asked for the Merit scholarship review'],
  ['impact.awarded', 'Gave 40 impact points for the beach clean-up'],
  ['safety.flagged', 'Flagged a message in Study Group B'],
  ['course.updated', 'Moved DES150 to the Design Studio'],
  ['user.deleted', 'Deleted a duplicate account'],
];

function entries() {
  const now = Date.now();
  // Mostly school hours on weekdays, a few evenings: a believable week.
  return Array.from({ length: 42 }, (_, i) => {
    const [action, summary] = WHAT[i % WHAT.length];
    const who = PEOPLE[i % PEOPLE.length];
    const day = Math.floor(i / 3.5);
    const hour = [9, 10, 10, 11, 14, 14, 14, 15, 16, 19, 10, 13][(i * 5) % 12];
    const t = new Date(now - day * 86_400_000);
    t.setHours(hour, (i * 13) % 60, 0, 0);
    return {
      id: `smp-audit-${i}`, actorId: who.id, actorName: who.name, actorRole: who.role, action, summary,
      targetType: action.split('.')[0], targetId: null, ip: null, metadata: null, createdAt: t.toISOString(),
    };
  }).filter((e) => Date.parse(e.createdAt) <= now);
}

const pick = (q: URLSearchParams) => entries().filter((e) => {
  const area = q.get('action'), who = q.get('actorId'), text = q.get('q')?.toLowerCase(), from = q.get('from'), to = q.get('to');
  return (!area || e.action.startsWith(`${area}.`) || e.action === area) && (!who || e.actorId === who)
    && (!text || `${e.summary} ${e.actorName}`.toLowerCase().includes(text))
    && (!from || e.createdAt >= from) && (!to || e.createdAt <= to);
});

export const sampleAudit = (q: URLSearchParams) => ({
  entries: pick(q), nextCursor: null,
  actors: Object.fromEntries(PEOPLE.map((p) => [p.id, { ...p, status: 'ACTIVE', lastSeenAt: new Date().toISOString() }])),
});
export const sampleAuditHeat = (q: URLSearchParams) => heatOf(pick(q).map((e) => ({ createdAt: new Date(e.createdAt), action: e.action })), Number(q.get('tz')) || 0);
export function sampleAuditActions() {
  const n = new Map<string, number>();
  for (const e of entries()) n.set(e.action, (n.get(e.action) ?? 0) + 1);
  return [...n].map(([action, count]) => ({ action, count }));
}
