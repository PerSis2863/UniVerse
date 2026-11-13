'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { useNow } from '@/lib/use-now';
import { Countdown, LiveCard } from './LiveCard';
import { Schedule } from './Schedule';
import { Tracks } from './Tracks';

// The homes' live cards (M48): the same two moving pictures, fed with what each home already loads
// (no new requests, so sample mode needs nothing new).

const many = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;
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
  courses: { id?: string; code: string; name: string; attendance?: number | null; averageGrade?: number | null }[];
  schedule: { start: string }[];
  upcoming: { title: string; dueDate: string; course: { code: string } }[];
  recentGrades: { name: string; course: string; percent: number }[];
}

/** A student's courses (M171): a mark per piece of work due and marked; the next one due pulses. */
export function StudentLive({ data }: { data: StudentData; name?: string | null }) {
  const now = useNow();
  const next = nextStart(data.schedule.map((c) => c.start), now);
  const soonest = [...data.upcoming].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const tracks = data.courses.slice(0, 8).map((c) => {
    const due = data.upcoming.filter((u) => u.course.code === c.code).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const marked = data.recentGrades.filter((g) => g.course === c.name || g.course === c.code);
    const when = due[0] && now ? formatDistanceToNowStrict(new Date(due[0].dueDate), { addSuffix: true }) : '';
    const detail = [due[0] ? `Next: ${due[0].title}, due ${when}` : 'Nothing due', c.attendance !== null && c.attendance !== undefined ? `attendance ${pct(c.attendance)}` : ''].filter(Boolean).join(' · ');
    const avg = c.averageGrade ?? null;
    return {
      key: c.id ?? c.code, label: c.code, name: c.name, href: c.id ? `/student/courses/${c.id}` : undefined,
      parts: [{ n: avg ?? 0, tone: 'pink' as const, label: 'Average grade' }],
      value: avg === null ? '—' : pct(avg), badge: due.length ? `${due.length} due` : undefined,
      next: !!due[0] && due[0] === soonest, detail: marked.length ? `${detail} · ${many(marked.length, 'mark')} lately` : detail,
    };
  });
  const ticker = [
    ...data.upcoming.slice(0, 4).map((u) => `${u.title} · ${u.course.code} · due ${formatDistanceToNowStrict(new Date(u.dueDate), { addSuffix: true })}`),
    ...data.recentGrades.slice(0, 3).map((g) => `${g.name}: ${g.percent}%`),
  ];
  return (
    <LiveCard title="Your courses" sub="Your average in each, what’s due next and your attendance. Open a course from its row."
      aside={next ? <Countdown to={next} label="Next class" /> : undefined}
      stats={[{ label: 'Attendance', value: pct(data.stats.attendance) }, { label: 'Average', value: pct(data.stats.averageGrade) }, { label: 'Due soon', value: String(data.stats.upcoming) }]}
      ticker={ticker.length ? ticker : ['Nothing due right now']}>
      {tracks.length ? <Tracks tracks={tracks} max={100} label="Your courses: average grade, work due, attendance" />
        : <p className="py-16 text-center text-sm text-white/70">Your courses appear here once you’re enrolled.</p>}
    </LiveCard>
  );
}

/** A teacher's classes (M171): a mark per student, lit for the share of work handed in. */
export function TeacherLive({ courses, recent, pending, avg }: {
  courses: { id?: string; code: string; name?: string; students: number; completion?: number }[];
  recent: { name: string; course: string; score: number }[];
  pending: number;
  avg: number;
  name?: string | null;
}) {
  const total = courses.reduce((a, c) => a + c.students, 0);
  return (
    <LiveCard title="Your classes, live" sub="Students in each class, and how many have handed their work in"
      stats={[{ label: 'Students', value: total.toLocaleString() }, { label: 'To grade', value: String(pending) }, { label: 'Average', value: `${avg}%` }]}
      ticker={recent.length ? recent.slice(0, 6).map((s) => `${s.name} · ${s.course} · ${s.score}%`) : ['No new work yet']}>
      {courses.length ? <Tracks label="Your classes and their students" tracks={courses.slice(0, 8).map((c) => {
        const done = Math.round((c.students * Math.max(0, Math.min(100, c.completion ?? 0))) / 100);
        return { key: c.id ?? c.code, label: c.code, name: c.name, value: many(c.students, 'student'),
          parts: [{ n: done, tone: 'pink' as const, label: 'Handed in' }, { n: c.students - done, tone: 'blue' as const, label: 'Still working' }],
          detail: c.completion !== undefined ? `${Math.round(c.completion)}% of the work handed in` : undefined };
      })} />
        : <p className="py-16 text-center text-sm text-white/70">Your classes appear here once you have a course.</p>}
    </LiveCard>
  );
}

/** The school's departments (M171): a mark per student and teacher. */
export function AdminLive({ departments, students, teachers, courses }: { departments: { name: string; students: number; teachers: number }[]; students: number; teachers: number; courses: number }) {
  return (
    <LiveCard title="School by department" sub="Students and teachers in each department"
      stats={[{ label: 'Students', value: students.toLocaleString() }, { label: 'Teachers', value: teachers.toLocaleString() }, { label: 'Courses', value: courses.toLocaleString() }]}>
      {departments.length ? <Tracks label="The school's departments" tracks={departments.slice(0, 8).map((d) => ({
        key: d.name, label: d.name, value: (d.students + d.teachers).toLocaleString(),
        parts: [{ n: d.students, tone: 'pink' as const, label: 'Students' }, { n: d.teachers, tone: 'aqua' as const, label: 'Teachers' }],
        detail: `${many(d.students, 'student')} · ${many(d.teachers, 'teacher')}${d.teachers && d.students ? ` · ${many(Math.round(d.students / d.teachers), 'student')} a teacher` : ''}`,
      }))} />
        : <p className="py-16 text-center text-sm text-white/70">Departments appear here once courses have one.</p>}
    </LiveCard>
  );
}

/** M50: today's classes as a timetable with a line for now (classes over turn grey). */
export function TodayLine({ classes }: { classes: { id: string; start: string; end: string; room: string | null; course: { code: string } }[] }) {
  const now = useNow();
  if (!now || !classes.length) return null;
  const at = (hm: string) => { const [h, m] = hm.split(':').map(Number); const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
  const slots = classes.map((c) => { const start = at(c.start), end = Math.max(at(c.end), start + 60_000); return { id: c.id, label: c.course.code, start, end, state: end < now ? 'done' as const : 'moving' as const, note: c.room ?? `${c.start}–${c.end}` }; });
  const from = Math.min(...slots.map((x) => x.start)) - 30 * 60_000, to = Math.max(...slots.map((x) => x.end)) + 30 * 60_000;
  return <Schedule className="mb-5" slots={slots} from={from} to={to} />;
}
