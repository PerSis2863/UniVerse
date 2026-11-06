'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, GraduationCap, Loader2, XCircle } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useAuthStore } from '@/store/auth';
import { authedJson } from '@/lib/authed-fetch';
import { api, errorMessage } from '@/lib/api';
import { clearInvite, inviteHref, rememberInvite } from '@/lib/course-invite';

// M113 (the council: one real class first): what a teacher's class link opens (/join?course=<id>).
// Signed out: make an account (a student's opens straight away when they come from a class link) or
// sign in, then back here (the class is remembered for a day: src/lib/course-invite.ts). Signed in
// as a student: the class's name and teacher, and Join (POST /courses/:id/enroll: a place, or the
// waitlist when the class is full). The course comes from GET /api/core/courses/:id (the catalogue view;
// people already in the class get the full one, with `enrollments`).

interface Info {
  id: string; code: string; name: string; status?: string; teacherId?: string;
  teacher?: { id: string; name: string } | null;
  /** Only in the full view, for people already in the class. */
  enrollments?: { studentId: string }[];
}

const noop = () => () => {};
const savedSignIn = () => { try { return !!localStorage.getItem('accessToken') && !!localStorage.getItem('universe-auth'); } catch { return false; } };

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <main className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 grid place-items-center mx-auto mb-5">{icon}</div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function CourseJoin({ courseId }: { courseId: string }) {
  const user = useAuthStore((s) => s.user);
  const signedIn = useSyncExternalStore(noop, savedSignIn, () => false) && !!user;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [waitlisted, setWaitlisted] = useState<number | null>(null);
  useEffect(() => { rememberInvite(courseId); }, [courseId]);
  const { data: course, error: loadError } = useSWR<Info>(signedIn ? `/api/core/courses/${encodeURIComponent(courseId)}` : null, authedJson);

  const student = user?.role === 'STUDENT';
  const inside = !!course && !!user && !!course.enrollments?.some((e) => e.studentId === user.id);
  const teaching = !!course && !!user && course.teacherId === user.id;
  const published = course?.status === 'PUBLISHED';
  // Nothing left to come back to: forget the class, so signing in later goes home as usual.
  const settled = !!loadError || inside || teaching || (!!course && (!student || !published));
  useEffect(() => { if (settled) clearInvite(); }, [settled]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ enrolled: boolean; position: number | null }>(`/courses/${courseId}/enroll`);
      clearInvite();
      if (data.enrolled) router.replace(`/student/blackboard?course=${encodeURIComponent(courseId)}`);
      else setWaitlisted(data.position ?? 0);
    } catch (e) {
      setError(errorMessage(e, 'Couldn’t join the class. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const tag = <GraduationCap className="w-8 h-8 text-white" aria-hidden />;
  if (!signedIn) {
    return (
      <Card icon={tag} title="You’re invited to a class">
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Your teacher shared this link. Make a free account (it opens straight away), then join the class with one tap.</p>
        <div className="mt-7 space-y-3">
          <Link href="/register?app=campus&as=student" className="btn-primary btn-lg w-full">Create my account</Link>
          <Link href={`/login?app=campus&next=${encodeURIComponent(inviteHref(courseId))}`} className="btn-secondary btn-lg w-full">I have an account: sign in</Link>
        </div>
      </Card>
    );
  }
  if (loadError) {
    return (
      <Card icon={<XCircle className="w-8 h-8 text-rose-400" aria-hidden />} title="This class link doesn’t work">
        <p className="mt-2 text-sm text-zinc-400">The class may have been removed, or the link was cut short. Ask your teacher to send it again.</p>
        <Link href="/app" className="btn-secondary btn-lg w-full mt-7">Go to my home</Link>
      </Card>
    );
  }
  if (!course) return <Card icon={<Loader2 className="w-8 h-8 text-white animate-spin" aria-hidden />} title="Opening the class…"><span className="sr-only">Loading</span></Card>;

  const title = <span translate="no">{course.code} · {course.name}</span>;
  if (teaching) {
    return (
      <Card icon={tag} title="This is your class’s link">
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Share it with your students: they join {title} from it, and you see who joined in the course, under Grades.</p>
        <Link href={`/teacher/blackboard?course=${encodeURIComponent(course.id)}`} className="btn-primary btn-lg w-full mt-7">Open the course</Link>
      </Card>
    );
  }
  if (!student) {
    return (
      <Card icon={tag} title="This link is for students">
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">You’re signed in with a staff or parent account. To join {title}, sign in with a student account.</p>
        <Link href="/app" className="btn-secondary btn-lg w-full mt-7">Go to my home</Link>
      </Card>
    );
  }
  if (inside) {
    return (
      <Card icon={<CheckCircle2 className="w-8 h-8 text-emerald-400" aria-hidden />} title="You’re in this class">
        <p className="mt-2 text-sm text-zinc-400">{title}</p>
        <Link href={`/student/blackboard?course=${encodeURIComponent(course.id)}`} className="btn-primary btn-lg w-full mt-7">Open the class</Link>
      </Card>
    );
  }
  if (!published) {
    return (
      <Card icon={<Clock className="w-8 h-8 text-amber-300" aria-hidden />} title="This class isn’t open yet">
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">Your teacher hasn’t published {title} yet. Open the link again once they have.</p>
        <Link href="/app" className="btn-secondary btn-lg w-full mt-7">Go to my home</Link>
      </Card>
    );
  }
  if (waitlisted !== null) {
    return (
      <Card icon={<Clock className="w-8 h-8 text-amber-300" aria-hidden />} title="The class is full for now">
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">You’re number {waitlisted} on the waitlist for {title}. You’ll get a notice when a place opens and you’re in.</p>
        <Link href="/student/courses" className="btn-secondary btn-lg w-full mt-7">My courses</Link>
      </Card>
    );
  }
  return (
    <Card icon={tag} title="Join this class?">
      <p className="mt-3 text-lg font-semibold text-white">{title}</p>
      {course.teacher?.name && <p className="mt-1 text-sm text-zinc-400">with <span translate="no">{course.teacher.name}</span></p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      <button type="button" onClick={() => void join()} disabled={busy} className="btn-primary btn-lg w-full mt-7">
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Join the class
      </button>
      <Link href="/app" onClick={() => clearInvite()} className="mt-3 inline-block text-sm text-zinc-400 hover:text-white">Not now</Link>
    </Card>
  );
}
