'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Topbar } from '@/components/layout/Topbar';
import { CommsDeck } from '@/components/chat/CommsDeck';
import { api, errorMessage } from '@/lib/api';
import { Bell, Edit, Eye, Loader2, Megaphone, RadioTower, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { removeWithUndo } from '@/lib/undo';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/use-now';

// Messages → Announcements (admins; M17): a broadcast studio. Write on the left and see it live on a
// phone on the right, as the lock-screen notification and as the card in the app (a push title is
// cut at about 50 characters, so the preview shows where). Below, every announcement with how many
// people have read it ("Seen by", from announcement_reads).

interface Announcement { id: string; title: string; body?: string | null; content?: string | null; createdAt: string; author?: { name: string } | null; course?: { name: string } | null; _count?: { reads: number } }
const PUSH_TITLE = 50;

export default function AdminAnnouncements() {
  const { data, isLoading: loading, mutate } = useSWR<Announcement[]>('/announcements', fetcher);
  const announcements = data ?? [];
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(0); // re-keys the phone so a published announcement "sends" from it

  const openEdit = (ann: Announcement) => {
    setEditTarget(ann);
    setTitle(ann.title);
    setBody(ann.content || ann.body || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const reset = () => { setEditTarget(null); setTitle(''); setBody(''); };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Give it a title.'); return; }
    if (!body.trim()) { toast.error('Write the announcement.'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await api.patch(`/announcements/${editTarget.id}`, { title: title.trim(), body: body.trim() });
        toast.success('Announcement updated');
      } else {
        await api.post('/announcements', { title: title.trim(), body: body.trim() });
        toast.success('Announcement published');
        setSent((n) => n + 1);
      }
      reset();
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the announcement.'));
    } finally {
      setSaving(false);
    }
  };

  // Gone at once with Undo; deleted when the message goes.
  const handleDelete = (id: string) => removeWithUndo('Announcement deleted', {
    hide: () => void mutate(announcements.filter((a) => a.id !== id), { revalidate: false }),
    restore: () => void mutate(),
    commit: async () => {
      try { await api.delete(`/announcements/${id}`); } catch (e) { throw new Error(errorMessage(e, 'Could not delete the announcement.')); }
      void mutate();
    },
  });

  return (
    <>
      <Topbar title="Announcements" subtitle="Tell the whole school something, and see who has read it" />
      <CommsDeck />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* The studio: write, and watch it on a phone. */}
          <section className="panel relative overflow-hidden p-5 sm:p-7 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-8 items-center" aria-labelledby="studio-h">
            <div className="space-y-4 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h2 id="studio-h" className="text-2xl font-black text-zinc-900 dark:text-white inline-flex items-center gap-2">
                  <span className="broadcast-icon relative w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center"><RadioTower className="w-5 h-5" /></span>
                  {editTarget ? 'Edit announcement' : 'New announcement'}
                </h2>
                {editTarget && <button type="button" onClick={reset} className="btn-secondary btn-sm"><X className="w-4 h-4" />Stop editing</button>}
              </div>
              <label className="block">
                <span className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300 mb-1"><span>Title</span><span className={cn('tabular-nums', title.length > PUSH_TITLE ? 'text-amber-700 dark:text-amber-300' : '')}>{title.length}/{PUSH_TITLE} on lock screens</span></span>
                <input type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Exams timetable is out" className="input text-base" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 block mb-1">Announcement</span>
                <textarea rows={6} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="Everything people need to know: what, when, where, and what to do." className="input resize-y" />
              </label>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{editTarget ? 'Changes show for everyone straight away.' : 'Goes to everyone in the school, in the app and as a notification.'}</p>
                <button type="button" onClick={() => void handleSave()} disabled={saving || !title.trim() || !body.trim()} className="btn-primary">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {editTarget ? 'Save changes' : 'Publish'}
                </button>
              </div>
            </div>
            <Phone key={sent} title={title} body={body} justSent={sent > 0} />
          </section>

          <section aria-labelledby="feed-h">
            <h2 id="feed-h" className="text-lg font-bold text-zinc-900 dark:text-white mb-3">Sent</h2>
            {loading ? (
              <ContentSkeleton variant="list" />
            ) : announcements.length === 0 ? (
              <div className="panel text-center py-12">
                <Megaphone className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
                <p className="text-zinc-600 dark:text-zinc-400">Nothing sent yet. Your first announcement will show here.</p>
              </div>
            ) : (
              <ol className="stagger space-y-3">
                {announcements.map((ann) => {
                  const reads = ann._count?.reads ?? 0;
                  return (
                    <li key={ann.id} className="panel group p-5 flex gap-4">
                      <span className="shrink-0 w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center"><Megaphone className="w-5 h-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-zinc-900 dark:text-white">{ann.title}</h3>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{ann.course?.name || 'Whole school'}</span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3 max-w-[75ch]">{ann.content || ann.body || ''}</p>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{ann.author?.name || 'Someone'} · {new Date(ann.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end justify-between gap-2">
                        <span className="seen-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" title="People who have opened it">
                          <Eye className="w-3.5 h-3.5" />Seen by {reads.toLocaleString()}
                        </span>
                        <div className="flex gap-1 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(ann)} aria-label={`Edit “${ann.title}”`} title="Edit" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(ann.id)} aria-label={`Delete “${ann.title}”`} title="Delete" className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:text-rose-600 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** A phone showing the announcement as it will arrive: the lock-screen notification, then the card. */
function Phone({ title, body, justSent }: { title: string; body: string; justSent: boolean }) {
  const t = title.trim() || 'Your title', b = body.trim() || 'What you write appears here, as people will see it.';
  const cut = t.length > PUSH_TITLE ? `${t.slice(0, PUSH_TITLE - 1)}…` : t;
  const now = useNow();
  const day = now ? new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  return (
    <div className={cn('phone mx-auto w-[260px] h-[520px] rounded-[44px] p-3 relative', justSent && 'phone-sent')} aria-label="Preview on a phone" role="img">
      <div className="phone-screen relative h-full rounded-[34px] overflow-hidden px-3 pt-10">
        <span aria-hidden className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black" />
        <p className="text-center text-white/90 text-5xl font-light tabular-nums">9:41</p>
        <p className="text-center text-white/70 text-xs mt-1">{day}</p>
        <div className="push-card mt-6 rounded-2xl bg-white/80 dark:bg-white/20 backdrop-blur-md p-3 text-start">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-white/80"><span className="w-4 h-4 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500" aria-hidden />UNIVERSE<span className="ms-auto font-normal">now</span></p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white leading-snug">{cut}</p>
          <p className="text-xs text-zinc-700 dark:text-white/80 line-clamp-2">{b}</p>
        </div>
        <div className="mt-3 rounded-2xl bg-white dark:bg-[#11212d] p-3 text-start shadow-lg">
          <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1"><Bell className="w-3 h-3" />In the app</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white leading-snug line-clamp-2">{t}</p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-6 whitespace-pre-line">{b}</p>
        </div>
      </div>
    </div>
  );
}
