'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FileUp, Loader2, Send } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { fetcher } from '@/lib/fetcher';
import { cn } from '@/lib/utils';

// A student asks to be excused (Stage 5 · Q11): a class, a day, why, and a document if there is
// one (a doctor's note); the teacher answers, and an approved day shows as Excused.

interface Excuse { id: string; date: string; reason: string; status: string; note: string | null; fileName: string | null; course: { code: string; name: string } }
type MyCourse = { id: string; course?: { id: string; code?: string; name: string } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function StudentExcuses() {
  const { data: mine, mutate } = useSWR<Excuse[]>('/api/attendance/excuses', authedJson);
  const { data: enrolments } = useSWR<MyCourse[]>('/courses/my', fetcher);
  const courses = (Array.isArray(enrolments) ? enrolments : []).map((e) => e.course).filter((c): c is NonNullable<MyCourse['course']> => !!c);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ courseId: '', day: today(), reason: '' });
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const courseId = form.courseId || courses[0]?.id || '';

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy('upload');
    try {
      const { uploadChatFile } = await import('@/components/chat/chat-client');
      setFile({ url: await uploadChatFile(f), name: f.name });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('send');
    try {
      await authedJson('/api/attendance/excuses', { method: 'POST', body: JSON.stringify({ courseId, day: form.day, reason: form.reason, fileUrl: file?.url, fileName: file?.name }) });
      toast.success('Sent to your teacher');
      setForm({ courseId, day: today(), reason: '' });
      setFile(null);
      setOpen(false);
      await mutate();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="excuse-title" className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="excuse-title" className="font-bold text-zinc-900 dark:text-white">Excuse requests</h2>
        {!open && courses.length > 0 && <button type="button" onClick={() => setOpen(true)} className="btn-primary btn-sm">Ask to be excused</button>}
      </div>
      {open && (
        <form onSubmit={send} className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Class
            <select value={courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="input mt-1">
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Day
            <input type="date" required value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="input mt-1" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Why
            <textarea required minLength={3} maxLength={1000} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input mt-1" placeholder="I had a fever and stayed home." />
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-secondary btn-sm">{busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}{file ? 'Change document' : 'Add a document (optional)'}</button>
            {file && <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-[14rem]">{file.name}</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={!!busy || !courseId} className="btn-primary btn-sm">{busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send</button>
          </div>
        </form>
      )}
      {!mine ? <div className="h-12 rounded-xl skeleton" /> : !mine.length ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No requests yet. Missed a class for a good reason? Ask your teacher to excuse it.</p>
      ) : (
        <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {mine.map((x) => (
            <li key={x.id} className="py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{x.course.code}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{format(new Date(x.date), 'EEE d MMM')}</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1 min-w-[10rem]">{x.reason}</span>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', x.status === 'PENDING' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : x.status === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300')}>{x.status === 'PENDING' ? 'Waiting' : x.status === 'APPROVED' ? 'Excused' : 'Declined'}</span>
              {x.note && <span className="basis-full text-xs text-zinc-600 dark:text-zinc-400">Teacher: {x.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
