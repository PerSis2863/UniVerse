'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { useNow } from '@/lib/use-now';
import { Constellation } from './Constellation';
import { Countdown, LiveCard } from './LiveCard';

// The homes' live cards (M48): the same two moving pictures, fed with what each home already loads
// (no new requests, so sample mode needs nothing new).

const initials = (name?: string | null) => (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'U';
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

/** The next class today ("HH:MM" starts), if one is still to come. */
function nextStart(starts: string[], now: number): number | null {
  if (!now) return null;
  const d = new Date(now);
  const times = starts.map((s) => { const [h, m] = s.split(':').map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x.getTime(); });
  return times.filter((x) => x > now).sort((a, b) => a - b)[0] ?? null;
}

interface StudentData {
  stats: { attendance: number | null; averageGrade: number | null; upcoming: number };
  courses: { code: string; name: string }[];
  schedule: { start: string }[];
  upcoming: { title: string; dueDate: string; course: { code: string } }[];
  recentGrades: { name: string; course: string; percent: number }[];
}

/** A student at the centre of their courses; each course's points are its work due and marked. */
export function StudentLive({ data, name }: { data: StudentData; name?: string | null }) {
  const now = useNow();
  const next = nextStart(data.schedule.map((c) => c.start), now);
  const groups = data.courses.slice(0, 8).map((c) => {
    const due = data.upcoming.filter((u) => u.course.code === c.code).length;
    const marked = data.recentGrades.filter((g) => g.course === c.name || g.course === c.code).length;
    return { label: c.code, n: 6 + 3 * due + 2 * marked, value: due ? `${due} due` : '' };
  });
  const ticker = [
    ...data.upcoming.slice(0, 4).map((u) => `${u.title} · ${u.course.code} · due ${formatDistanceToNowStrict(new Date(u.dueDate), { addSuffix: true })}`),
    ...data.recentGrades.slice(0, 3).map((g) => `${g.name}: ${g.percent}%`),
  ];
  return (
    <LiveCard title="Your constellation" sub="Your courses, with the work due and marked in each"
      aside={next ? <Countdown to={next} label="Next class" /> : undefined}
      stats={[{ label: 'Attendance', value: pct(data.stats.attendance) }, { label: 'Average', value: pct(data.stats.averageGrade) }, { label: 'Due soon', value: String(data.stats.upcoming) }]}
      ticker={ticker.length ? ticker : ['Nothing due right now']}>
      {groups.length ? <Constellation groups={groups} center={initials(name)} label="Your courses around you" className="h-[280px] md:h-[320px]" />
        : <p className="py-16 text-center text-sm text-white/70">Your courses appear here once you’re enrolled.</p>}
    </LiveCard>
  );
}

/** A teacher's classes around them; each class's points are its students. */
export function TeacherLive({ courses, recent, pending, avg, name }: {
  courses: { code: string; students: number }[];
  recent: { name: string; course: string; score: number }[];
  pending: number;
  avg: number;
  name?: string | null;
}) {
  const total = courses.reduce((a, c) => a + c.students, 0);
  return (
    <LiveCard title="Your classes, live" sub="Each point is a student"
      stats={[{ label: 'Students', value: total.toLocaleString() }, { label: 'To grade', value: String(pending) }, { label: 'Average', value: `${avg}%` }]}
      ticker={recent.length ? recent.slice(0, 6).map((s) => `${s.name} · ${s.course} · ${s.score}%`) : ['No new work yet']}>
      {courses.length ? <Constellation groups={courses.slice(0, 8).map((c) => ({ label: c.code, n: c.students }))} center={initials(name)} label="Your classes and their students" className="h-[280px] md:h-[320px]" />
        : <p className="py-16 text-center text-sm text-white/70">Your classes appear here once you have a course.</p>}
    </LiveCard>
  );
}

/** The school's departments; each point is a person. */
export function AdminLive({ departments, students, teachers, courses }: { departments: { name: string; students: number; teachers: number }[]; students: number; teachers: number; courses: number }) {
  return (
    <LiveCard title="School constellation" sub="Departments, each point a person"
      stats={[{ label: 'Students', value: students.toLocaleString() }, { label: 'Teachers', value: teachers.toLocaleString() }, { label: 'Courses', value: courses.toLocaleString() }]}>
      {departments.length ? <Constellation groups={departments.slice(0, 8).map((d) => ({ label: d.name, n: d.students + d.teachers }))} center="U" label="The school's departments" className="h-[280px] md:h-[340px]" />
        : <p className="py-16 text-center text-sm text-white/70">Departments appear here once courses have one.</p>}
    </LiveCard>
  );
}
