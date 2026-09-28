'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import useSWR, { type KeyedMutator } from 'swr';
import { haptic } from '@/lib/haptics';
import { motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { vtName } from '@/lib/view-transition';
import { toast } from 'sonner';
import {
  Bell, BookOpen, Calendar, CheckCircle2, Download, ExternalLink, FileText, Film, Image as ImageIcon,
  Loader2, Paperclip, PenTool, Plus, Send, Star, Trash2, Users, X, type LucideIcon,
} from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { QuizManager } from '@/components/quizzes/QuizManager';
import { uploadChatFile } from '@/components/chat/chat-client';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import { isUploadedFileUrl } from '@/lib/file-urls';

const Whiteboard = dynamic(() => import('@/components/dashboard/CollaborationWhiteboard').then((m) => m.CollaborationWhiteboard), {
  ssr: false,
  loading: () => <div className="h-[600px] rounded-2xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />,
});

type Role = 'student' | 'teacher';
interface Course { id: string; name: string; code: string; color: string | null; teacher?: { id: string; name: string } | null }
interface Board {
  course: Course & { _count: { enrollments: number } };
  canManage: boolean;
  announcements: { id: string; title: string; body: string; createdAt: string; author: { name: string } }[];
  materials: { id: string; title: string; type: 'PDF' | 'DOCX' | 'VIDEO' | 'IMAGE' | 'OTHER'; fileUrl: string; size: string | null; createdAt: string }[];
  readings: { id: string; title: string; description: string | null; url: string | null; category: string | null }[];
  events: { id: string; title: string; description: string | null; startAt: string; endAt: string; type: string }[];
  // Student view
  grades?: { id: string; assignmentName: string; score: number; maxScore: number; status: string; feedback: string | null; gradedAt: string }[];
  quizResults?: { id: string; score: number | null; maxScore: number | null; submittedAt: string; quiz: { id: string; title: string; status: string } }[];
  // Teacher view
  quizzes?: { id: string; title: string; status: string; dueDate: string | null; _count: { questions: number; submissions: number } }[];
  roster?: { id: string; name: string; email: string; graded: number; average: number | null }[];
}

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'board', label: 'Announcements', icon: Bell },
  { id: 'materials', label: 'Materials', icon: FileText },
  { id: 'readings', label: 'Reading list', icon: BookOpen },
  { id: 'grades', label: 'Grades', icon: Star },
  { id: 'quizzes', label: 'Quizzes', icon: CheckCircle2 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
];

const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const pct = (s: number | null, m: number | null) => (s != null && m ? Math.round((s / m) * 100) : null);
const TYPE_ICON: Record<string, LucideIcon> = { PDF: FileText, DOCX: FileText, VIDEO: Film, IMAGE: ImageIcon, OTHER: Paperclip };
const absolute = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url);

/** A course's Blackboard for students (read, grades, quiz reviews) and its teacher (post, upload, manage). Everything here is live data. */
export function CourseBoard({ role }: { role: Role }) {
  const router = useRouter();
  const { data: mine, isLoading: loadingCourses } = useSWR<any[]>('/courses/my', fetcher);
  const courses: Course[] = useMemo(
    () => (Array.isArray(mine) ? (role === 'student' ? mine.map((e) => e.course).filter(Boolean) : mine) : []),
    [mine, role],
  );
  const [courseId, setCourseId] = useState<string | null>(null);
  const [tab, setTab] = useState('board');

  // Deep links: ?course=<id>&tab=<tab>
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('tab') && TABS.some((t) => t.id === sp.get('tab'))) setTab(sp.get('tab')!);
    if (sp.get('course')) setCourseId(sp.get('course'));
  }, []);
  useEffect(() => {
    if (courses.length && (!courseId || !courses.some((c) => c.id === courseId))) setCourseId(courses[0].id);
  }, [courses, courseId]);

  const { data: board, error, isLoading, mutate } = useSWR<Board>(courseId ? `/api/courses/${courseId}/board` : null, authedJson);

  const title = 'Blackboard';
  const subtitle = role === 'teacher' ? 'Post announcements, share materials and run your courses' : 'Announcements, materials, grades and quizzes for your courses';

  if (loadingCourses) return (<><Topbar title={title} subtitle={subtitle} /><div className="p-8 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div></>);
  if (!courses.length) {
    return (
      <>
        <Topbar title={title} subtitle={subtitle} />
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <FeatureGuide
            icon={BookOpen}
            title={role === 'teacher' ? 'Your course spaces will appear here' : 'Your course spaces live here'}
            description={role === 'teacher'
              ? 'Once a course is assigned to you, it gets a Blackboard where you post announcements, share materials, schedule sessions and run quizzes.'
              : "Each course you're enrolled in gets a Blackboard with announcements, materials, your grades and quiz results."}
            steps={role === 'teacher'
              ? ['Ask your campus admin to assign you a course', 'Post a welcome announcement', 'Upload the first week’s materials']
              : ['Get enrolled in a course by your teacher or admin', 'Open it here to see materials and announcements', 'Check grades and review quiz results']}
            example={<div><ExampleRow title="Week 3 · Process Scheduling slides" meta="Operating Systems · PDF" right="New" /><ExampleRow title="Midterm on Friday, 10:00" meta="Operating Systems · Exam" right="3 days" accent="from-amber-500 to-orange-500" /></div>}
            action={{ label: 'Go to my courses', href: role === 'teacher' ? '/teacher/courses' : '/student/courses' }}
          />
        </div>
      </>
    );
  }

  const course = board?.course ?? courses.find((c) => c.id === courseId);
  const canManage = !!board?.canManage;

  const messageInstructor = async () => {
    const teacherId = course?.teacher?.id;
    if (!teacherId) return void toast.error('This course has no instructor assigned yet.');
    try {
      const { id } = await authedJson<{ id: string }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ userId: teacherId }) });
      router.push(`/student/inbox?c=${id}`);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Course switcher */}
        <div className="glass-bar border-b border-zinc-200/70 dark:border-white/[0.06] px-4 sm:px-8 py-3 flex gap-2 overflow-x-auto scrollbar-none">
          {courses.map((c) => (
            <button key={c.id} onClick={() => setCourseId(c.id)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm whitespace-nowrap border transition-all',
                courseId === c.id ? 'text-white border-transparent shadow-lg' : 'bg-white/60 dark:bg-white/[0.04] border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:border-indigo-400/40')}
              style={courseId === c.id ? { background: c.color || '#4f46e5' } : undefined}>
              <span className="font-bold">{c.code}</span>
              <span className="hidden sm:inline opacity-80">{c.name.split(' ').slice(0, 3).join(' ')}</span>
            </button>
          ))}
        </div>

        {/* Header */}
        <div className="px-4 sm:px-8 py-4 border-b border-zinc-200/70 dark:border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: course?.color || '#4f46e5', viewTransitionName: course ? vtName('course', course.id) : undefined }}>{course?.code?.slice(-2)}</div>
            <div className="min-w-0">
              <h2 className="font-bold text-zinc-900 dark:text-white truncate" style={{ viewTransitionName: course ? vtName('course-title', course.id) : undefined }}>{course?.name}</h2>
              <p className="text-xs text-zinc-500">{course?.teacher?.name ?? 'Instructor'}{board ? ` · ${board.course._count.enrollments} student${board.course._count.enrollments === 1 ? '' : 's'}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {role === 'student' ? (
              <>
                <Link href="/student/grades" className="btn-secondary text-xs py-2 flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> All my grades</Link>
                <button onClick={messageInstructor} className="btn-primary text-xs py-2 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Message instructor</button>
              </>
            ) : (
              <>
                <Link href="/teacher/grades" className="btn-secondary text-xs py-2 flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> Gradebook</Link>
                <Link href="/teacher/quizzes" className="btn-primary text-xs py-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Quizzes</Link>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-none border-b border-zinc-200/70 dark:border-white/[0.06] px-4 sm:px-8">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={cn('relative flex items-center gap-1.5 px-3 py-3.5 text-xs font-semibold whitespace-nowrap transition-colors',
                tab === t.id ? 'text-indigo-600 dark:text-indigo-300' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {tab === t.id && <motion.span layoutId="board-tab" transition={spring.snappy} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-500" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {error ? <p className="text-sm text-rose-500">{(error as Error).message}</p>
            : isLoading || !board ? <div className="max-w-3xl mx-auto space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />)}</div>
            : (
              <div key={`${courseId}-${tab}`} className={cn('fade-up mx-auto', tab === 'whiteboard' ? 'max-w-6xl' : 'max-w-3xl')}>
                {tab === 'board' && <Announcements board={board} canManage={canManage} refresh={mutate} />}
                {tab === 'materials' && <Materials board={board} canManage={canManage} refresh={mutate} />}
                {tab === 'readings' && <Readings board={board} canManage={canManage} refresh={mutate} />}
                {tab === 'grades' && (canManage ? <Roster board={board} /> : <MyGrades board={board} />)}
                {tab === 'quizzes' && (canManage ? <TeacherQuizzes board={board} refresh={mutate} /> : <MyQuizzes board={board} />)}
                {tab === 'calendar' && <Events board={board} canManage={canManage} refresh={mutate} />}
                {tab === 'whiteboard' && (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500">A personal whiteboard for {board.course.code}. It&apos;s saved on this device; use Share or Export to send it to classmates.</p>
                    <Whiteboard boardId={`${board.course.id}`} title={`${board.course.code} whiteboard`} />
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

type SectionProps = { board: Board; canManage: boolean; refresh: KeyedMutator<Board> };

const LIST_OF = { announcement: 'announcements', material: 'materials', reading: 'readings', event: 'events' } as const;

/** Removes an item at once and offers Undo for a few seconds; the server delete happens only if it isn't undone. */
function useRemove(courseId: string, refresh: KeyedMutator<Board>) {
  return (kind: keyof typeof LIST_OF, itemId: string, label: string) => {
    const list = LIST_OF[kind];
    let settled = false;
    haptic('tap');
    refresh((cur) => cur && { ...cur, [list]: (cur[list] as { id: string }[]).filter((x) => x.id !== itemId) }, { revalidate: false });
    const commit = async () => {
      if (settled) return;
      settled = true;
      try {
        await authedJson(`/api/courses/${courseId}/board?kind=${kind}&itemId=${itemId}`, { method: 'DELETE' });
      } catch (e: any) {
        toast.error(e.message || 'Could not remove it');
        refresh();
      }
    };
    toast(`Removed “${label}”`, {
      duration: 5000,
      action: { label: 'Undo', onClick: () => { settled = true; refresh(); } },
      onAutoClose: commit,
      onDismiss: commit,
    });
  };
}

function usePost(courseId: string, refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const post = async (body: object, ok: string) => {
    setBusy(true);
    try {
      await authedJson(`/api/courses/${courseId}/board`, { method: 'POST', body: JSON.stringify(body) });
      refresh();
      toast.success(ok);
      return true;
    } catch (e: any) { toast.error(e.message); return false; } finally { setBusy(false); }
  };
  return { post, busy };
}

function SectionHead({ icon: Icon, title, count, action }: { icon: LucideIcon; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" /> {title}{count != null && <span className="text-xs font-normal text-zinc-500">({count})</span>}</h3>
      {action}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /> {label}</button>;
}

function FormShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4 p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/[0.06] border border-indigo-200/60 dark:border-indigo-400/20 space-y-3">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p><button onClick={onClose} aria-label="Cancel" className="p-1 text-zinc-500"><X className="w-4 h-4" /></button></div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className={`${card} p-8 text-center text-sm text-zinc-500`}>{text}</div>;
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} aria-label="Remove" className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"><Trash2 className="w-4 h-4" /></button>;
}

// ─── Announcements ─────────────────────────────────────────────────────────

function Announcements({ board, canManage, refresh }: SectionProps) {
  const [form, setForm] = useState<{ title: string; body: string } | null>(null);
  const { post, busy } = usePost(board.course.id, refresh);
  const remove = useRemove(board.course.id, refresh);
  return (
    <>
      <SectionHead icon={Bell} title="Announcements" count={board.announcements.length} action={canManage && !form && <AddButton label="Post" onClick={() => setForm({ title: '', body: '' })} />} />
      {form && (
        <FormShell title="New announcement — enrolled students get a notification" onClose={() => setForm(null)}>
          <input className={input} placeholder="Title" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className={`${input} min-h-[100px]`} placeholder="What do students need to know?" maxLength={5000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <button disabled={busy || !form.title.trim() || !form.body.trim()} onClick={async () => (await post({ kind: 'announcement', ...form }, 'Announcement posted')) && setForm(null)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Post announcement</button>
        </FormShell>
      )}
      {board.announcements.length === 0 && !form ? <Empty text={canManage ? 'No announcements yet. Post a welcome message to get your class started.' : 'No announcements yet. Your instructor’s updates will appear here.'} /> : (
        <div className="space-y-3">
          {board.announcements.map((a) => (
            <div key={a.id} className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-bold text-zinc-900 dark:text-white">{a.title}</h4>
                <div className="flex items-center gap-1 shrink-0"><span className="text-xs text-zinc-400">{when(a.createdAt)}</span>{canManage && <RemoveBtn onClick={() => remove('announcement', a.id, a.title)} />}</div>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mt-2 whitespace-pre-line">{a.body}</p>
              <p className="text-xs text-zinc-400 mt-3">Posted by <span className="text-indigo-500 font-medium">{a.author.name}</span></p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Materials ─────────────────────────────────────────────────────────────

function Materials({ board, canManage, refresh }: SectionProps) {
  const [form, setForm] = useState<{ title: string; url: string; fileName: string; size: string } | null>(null);
  const [uploading, setUploading] = useState(0);
  const { post, busy } = usePost(board.course.id, refresh);
  const remove = useRemove(board.course.id, refresh);

  const pickFile = async (file: File | undefined) => {
    if (!file || !form) return;
    setUploading(1);
    try {
      const url = await uploadChatFile(file, (p) => setUploading(Math.max(1, p)));
      const size = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
      setForm((f) => f && { ...f, url, fileName: file.name, size, title: f.title || file.name.replace(/\.[^.]+$/, '') });
    } catch (e: any) { toast.error(e.message); } finally { setUploading(0); }
  };

  return (
    <>
      <SectionHead icon={FileText} title="Course materials" count={board.materials.length} action={canManage && !form && <AddButton label="Add material" onClick={() => setForm({ title: '', url: '', fileName: '', size: '' })} />} />
      {form && (
        <FormShell title="Add a file or a link" onClose={() => setForm(null)}>
          <input className={input} placeholder="Title, e.g. Week 3 slides" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className={cn('flex items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed text-sm cursor-pointer transition-colors', form.fileName ? 'border-emerald-400/50 text-emerald-600 dark:text-emerald-400' : 'border-zinc-300 dark:border-white/15 text-zinc-500 hover:border-indigo-400/60')}>
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov" onChange={(e) => pickFile(e.target.files?.[0])} />
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading… {uploading}%</> : form.fileName ? <><CheckCircle2 className="w-4 h-4" /> {form.fileName} · {form.size}</> : <><Paperclip className="w-4 h-4" /> Choose a file (up to 4 MB)</>}
          </label>
          {!form.fileName && <input className={input} placeholder="…or paste a link (Google Drive, YouTube, website)" maxLength={1000} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />}
          <button disabled={busy || !!uploading || !form.title.trim() || !form.url.trim()} onClick={async () => (await post({ kind: 'material', ...form }, 'Material shared with the class')) && setForm(null)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Share with class</button>
        </FormShell>
      )}
      {board.materials.length === 0 && !form ? <Empty text={canManage ? 'No materials yet. Upload slides, notes or add links for your students.' : 'No materials yet. Files your instructor shares will appear here.'} /> : (
        <div className="space-y-2">
          {board.materials.map((m) => {
            const Icon = TYPE_ICON[m.type] ?? Paperclip;
            const external = !isUploadedFileUrl(m.fileUrl);
            return (
              <div key={m.id} className={`${card} p-4 flex items-center gap-3 hover:border-indigo-500/40 transition-colors`}>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-indigo-500" /></div>
                <a href={absolute(m.fileUrl)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 group">
                  <p className="font-medium text-sm text-zinc-900 dark:text-white truncate group-hover:text-indigo-500">{m.title}</p>
                  <p className="text-xs text-zinc-500">{external ? 'Link' : m.type}{m.size ? ` · ${m.size}` : ''} · {day(m.createdAt)}</p>
                </a>
                <a href={absolute(m.fileUrl)} target="_blank" rel="noopener noreferrer" download={!external || undefined} aria-label={external ? 'Open link' : 'Download'} className="p-2 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10">
                  {external ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                </a>
                {canManage && <RemoveBtn onClick={() => remove('material', m.id, m.title)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Reading list ──────────────────────────────────────────────────────────

function Readings({ board, canManage, refresh }: SectionProps) {
  const [form, setForm] = useState<{ title: string; url: string; description: string; category: string } | null>(null);
  const { post, busy } = usePost(board.course.id, refresh);
  const remove = useRemove(board.course.id, refresh);
  return (
    <>
      <SectionHead icon={BookOpen} title="Reading list" count={board.readings.length} action={canManage && !form && <AddButton label="Add reading" onClick={() => setForm({ title: '', url: '', description: '', category: 'Paper' })} />} />
      {form && (
        <FormShell title="Recommend a paper, article or book" onClose={() => setForm(null)}>
          <input className={input} placeholder="Title" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={input} placeholder="https://… (optional)" maxLength={1000} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{['Paper', 'Article', 'Book', 'Video', 'Website'].map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <textarea className={`${input} min-h-[70px]`} placeholder="Why should students read this? (optional)" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button disabled={busy || !form.title.trim()} onClick={async () => (await post({ kind: 'reading', ...form }, 'Added to the reading list')) && setForm(null)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add</button>
        </FormShell>
      )}
      {board.readings.length === 0 && !form ? <Empty text={canManage ? 'Nothing on the reading list yet. Add papers, articles or books for this course.' : 'No readings yet. Papers and articles your instructor recommends will appear here.'} /> : (
        <div className="space-y-3">
          {board.readings.map((r) => (
            <div key={r.id} className={`${card} p-5 flex items-start gap-3`}>
              <div className="flex-1 min-w-0">
                {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-zinc-900 dark:text-white hover:text-indigo-500 inline-flex items-center gap-1.5">{r.title} <ExternalLink className="w-3.5 h-3.5" /></a>
                  : <p className="font-bold text-sm text-zinc-900 dark:text-white">{r.title}</p>}
                {r.description && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{r.description}</p>}
                {r.category && <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{r.category}</span>}
              </div>
              {canManage && <RemoveBtn onClick={() => remove('reading', r.id, r.title)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Grades ────────────────────────────────────────────────────────────────

function MyGrades({ board }: { board: Board }) {
  const grades = board.grades ?? [];
  const avg = grades.length ? Math.round(grades.reduce((s, g) => s + (g.maxScore ? g.score / g.maxScore : 0), 0) / grades.length * 100) : null;
  return (
    <>
      <SectionHead icon={Star} title="My grades in this course" count={grades.length} action={<Link href="/student/grades" className="text-xs font-semibold text-indigo-500 hover:underline">Full report →</Link>} />
      {grades.length === 0 ? <Empty text="No grades yet. Marks your instructor records for this course will appear here." /> : (
        <>
          <div className={`${card} p-5 mb-3 flex items-center justify-between`}>
            <span className="text-sm text-zinc-500">Course average across {grades.length} graded item{grades.length === 1 ? '' : 's'}</span>
            <span className="text-2xl font-black text-zinc-900 dark:text-white">{avg}%</span>
          </div>
          <div className="space-y-2">
            {grades.map((g) => {
              const p = pct(g.score, g.maxScore) ?? 0;
              return (
                <div key={g.id} className={`${card} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="font-medium text-sm text-zinc-900 dark:text-white truncate">{g.assignmentName}</p><p className="text-xs text-zinc-500">{day(g.gradedAt)}</p></div>
                    <span className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">{g.score}/{g.maxScore} <span className="text-xs text-zinc-500 font-medium">({p}%)</span></span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className={cn('h-full rounded-full', p >= 70 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.min(p, 100)}%` }} /></div>
                  {g.feedback && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 italic">“{g.feedback}”</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Roster({ board }: { board: Board }) {
  const roster = board.roster ?? [];
  return (
    <>
      <SectionHead icon={Users} title="Class roster" count={roster.length} action={<Link href="/teacher/grades" className="text-xs font-semibold text-indigo-500 hover:underline">Enter grades →</Link>} />
      {roster.length === 0 ? <Empty text="No students enrolled yet. Ask your campus admin to enroll students in this course." /> : (
        <div className={`${card} divide-y divide-zinc-200/70 dark:divide-white/[0.06]`}>
          {roster.map((s) => (
            <div key={s.id} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">{s.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{s.name}</p><p className="text-xs text-zinc-500 truncate">{s.email}</p></div>
              <div className="text-right"><p className="text-sm font-bold text-zinc-900 dark:text-white">{s.average != null ? `${s.average}%` : '—'}</p><p className="text-[10px] text-zinc-500">{s.graded} graded</p></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Quizzes ───────────────────────────────────────────────────────────────

function MyQuizzes({ board }: { board: Board }) {
  const results = board.quizResults ?? [];
  const [review, setReview] = useState<string | null>(null);
  return (
    <>
      <SectionHead icon={CheckCircle2} title="My quiz results" count={results.length} action={<Link href="/student/quizzes" className="text-xs font-semibold text-indigo-500 hover:underline">Take open quizzes →</Link>} />
      {results.length === 0 ? <Empty text="You haven’t taken a quiz in this course yet. Open quizzes are on the Quizzes page." /> : (
        <div className="space-y-2">
          {results.map((r) => {
            const p = pct(r.score, r.maxScore);
            return (
              <div key={r.id} className={`${card} p-4 flex items-center gap-4`}>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{p ?? '—'}{p != null && '%'}</span></div>
                <div className="flex-1 min-w-0"><p className="font-medium text-sm text-zinc-900 dark:text-white truncate">{r.quiz.title}</p><p className="text-xs text-zinc-500">{r.score ?? 0}/{r.maxScore ?? 0} points · {day(r.submittedAt)}</p></div>
                <button onClick={() => setReview(r.quiz.id)} className="btn-secondary text-xs py-1.5 px-3">Review</button>
              </div>
            );
          })}
        </div>
      )}
      {review && <QuizReview quizId={review} onClose={() => setReview(null)} />}
    </>
  );
}

export function QuizReview({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const { data, error } = useSWR<{
    title: string; score: number | null; maxScore: number | null; revealed: boolean;
    questions: { id: string; question: string; options: string[]; points: number; yourAnswer: string | null; correct?: boolean; correctAnswer?: string }[];
  }>(`/api/quizzes/${quizId}/result`, authedJson);
  return (
    <div className="backdrop-in fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet-in w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-sidebar border border-zinc-200 dark:border-white/10 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200/70 dark:border-white/[0.07] bg-white/70 dark:bg-[#0f1322]/80 backdrop-blur-xl">
          <div className="min-w-0"><h3 className="font-bold text-zinc-900 dark:text-white truncate">{data?.title ?? 'Quiz review'}</h3>{data && <p className="text-xs text-zinc-500">Score {data.score ?? 0}/{data.maxScore ?? 0}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {!data && !error && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>}
          {data && !data.revealed && <p className="text-xs p-3 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">Correct answers are shown once the quiz closes or passes its due date.</p>}
          {data?.questions.map((q, i) => (
            <div key={q.id} className="p-4 rounded-2xl border border-zinc-200/70 dark:border-white/[0.07]">
              <p className="font-semibold text-sm text-zinc-900 dark:text-white mb-3">{i + 1}. {q.question} <span className="text-xs text-zinc-500 font-normal">· {q.points} pt{q.points === 1 ? '' : 's'}</span></p>
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const mine = o === q.yourAnswer, right = data.revealed && o === q.correctAnswer;
                  return (
                    <div key={o} className={cn('text-sm px-3 py-2 rounded-lg border flex items-center gap-2',
                      right ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : mine && data.revealed ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                        : mine ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400')}>
                      {right && <CheckCircle2 className="w-4 h-4" />}{o}{mine && <span className="ml-auto text-[10px] font-bold uppercase">Your answer</span>}
                    </div>
                  );
                })}
                {!q.yourAnswer && <p className="text-xs text-zinc-500">You didn’t answer this question.</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeacherQuizzes({ board, refresh }: { board: Board; refresh: () => void }) {
  const quizzes = board.quizzes ?? [];
  const [managing, setManaging] = useState<string | null>(null);
  return (
    <>
      <SectionHead icon={CheckCircle2} title="Quizzes" count={quizzes.length} action={<Link href="/teacher/quizzes" className="text-xs font-semibold text-indigo-500 hover:underline">Create a quiz →</Link>} />
      {quizzes.length === 0 ? <Empty text="No quizzes for this course yet. Create one on the Quizzes page, add questions, then publish it." /> : (
        <div className="space-y-2">
          {quizzes.map((q) => (
            <div key={q.id} className={`${card} p-4 flex items-center gap-3`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-zinc-900 dark:text-white truncate">{q.title}</p>
                <p className="text-xs text-zinc-500">{q.status === 'PUBLISHED' ? 'Published' : q.status === 'CLOSED' ? 'Closed' : 'Draft'} · {q._count.questions} questions · {q._count.submissions} submissions{q.dueDate ? ` · due ${day(q.dueDate)}` : ''}</p>
              </div>
              <button onClick={() => setManaging(q.id)} className="btn-secondary text-xs py-1.5 px-3">Manage</button>
            </div>
          ))}
        </div>
      )}
      {managing && <QuizManager quizId={managing} onClose={() => setManaging(null)} onChanged={refresh} />}
    </>
  );
}

// ─── Calendar ──────────────────────────────────────────────────────────────

const EVENT_TYPES: Record<string, string> = { MEETING: 'Session', EXAM: 'Exam', DEADLINE: 'Deadline' };

function icsFor(board: Board) {
  const stamp = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniVerse//Course Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const e of board.events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@universe`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.startAt)}`, `DTEND:${stamp(e.endAt)}`,
      `SUMMARY:${esc(`${board.course.code}: ${e.title}`)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Events({ board, canManage, refresh }: SectionProps) {
  const [form, setForm] = useState<{ title: string; startAt: string; durationMinutes: number; type: string; description: string } | null>(null);
  const { post, busy } = usePost(board.course.id, refresh);
  const remove = useRemove(board.course.id, refresh);
  return (
    <>
      <SectionHead icon={Calendar} title="Upcoming" count={board.events.length} action={
        <div className="flex gap-2">
          {board.events.length > 0 && <button onClick={() => downloadIcs(icsFor(board), `${board.course.code}-calendar.ics`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 text-xs font-bold"><Download className="w-3.5 h-3.5" /> Add to my calendar</button>}
          {canManage && !form && <AddButton label="Add event" onClick={() => setForm({ title: '', startAt: '', durationMinutes: 60, type: 'MEETING', description: '' })} />}
        </div>
      } />
      {form && (
        <FormShell title="Schedule a session, exam or deadline" onClose={() => setForm(null)}>
          <input className={input} placeholder="Title, e.g. Midterm exam" maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid sm:grid-cols-3 gap-3">
            <input className={input} type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            <select className={input} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>{[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
            <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <input className={input} placeholder="Room or notes (optional)" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button disabled={busy || !form.title.trim() || !form.startAt} onClick={async () => (await post({ kind: 'event', ...form, startAt: new Date(form.startAt).toISOString() }, 'Added to the course calendar')) && setForm(null)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Add event</button>
        </FormShell>
      )}
      {board.events.length === 0 && !form ? <Empty text={canManage ? 'Nothing scheduled. Add exams, deadlines or extra sessions so students can plan ahead.' : 'Nothing scheduled yet. Exams, deadlines and sessions for this course will appear here.'} /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {board.events.map((e) => (
            <div key={e.id} className={`${card} p-4 flex items-start gap-3`}>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white', e.type === 'EXAM' ? 'bg-rose-500' : e.type === 'DEADLINE' ? 'bg-amber-500' : 'bg-indigo-500')}><Calendar className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-zinc-900 dark:text-white">{e.title}</p>
                <p className="text-xs text-zinc-500">{when(e.startAt)} · {EVENT_TYPES[e.type] ?? 'Event'}</p>
                {e.description && <p className="text-xs text-zinc-500 mt-1">{e.description}</p>}
              </div>
              {canManage && <RemoveBtn onClick={() => remove('event', e.id, e.title)} />}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

