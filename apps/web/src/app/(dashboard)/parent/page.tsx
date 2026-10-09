'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CircleUser, KeyRound, Link2, Loader2, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { Sheet } from '@/components/ui/Sheet';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { LoadError } from '@/components/ui/LoadError';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { ChildView, type ChildData } from '@/components/guardian/ChildView';
import { ParentMessages } from '@/components/guardian/ParentMessages';
import { FORMS_KEY, ParentForms, type ParentFormsData } from '@/components/guardian/ParentForms';
import { ParentMeetings } from '@/components/guardian/ParentMeetings';
import { authedJson } from '@/lib/authed-fetch';
import { api, errorMessage } from '@/lib/api';
import { fadeUp } from '@/lib/motion';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// The parent app (Stage 5 · B16.1): a parent or guardian account sees each linked child's
// schoolwork (src/server/guardian-view.ts) and links children with the code they make in their
// Settings. Parent accounts can't open anything else in UniVerse (src/server/auth.ts).

type Child = ChildData & { linkId: string; studentId: string; relation: string | null };
type Note = { id: string; title: string; body: string; read: boolean; createdAt: string };

const KEY = '/api/parent/children';
type Tab = 'school' | 'messages' | 'meetings' | 'forms';
const RELATIONS = ['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'Other'];

export default function ParentPage() {
  const { data, error, isLoading, mutate } = useSWR<{ children: Child[] }>(KEY, authedJson);
  const { data: notes } = useSWR<Note[]>('/api/notifications', authedJson);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState<'account' | 'updates' | null>(null);
  // Schoolwork, messages with the child's teachers (B16.2), meetings (B16.3) or forms to sign
  // (B16.4); ?chat=<id>, ?tab=meetings or ?tab=forms&form=<id> (from a notification) open them.
  const [tab, setTab] = useState<Tab>('school');
  const [chatId, setChatId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('chat')));
  const [formId, setFormId] = useState<string | null>(null);
  const { data: forms } = useSWR<ParentFormsData>(data?.children.length ? FORMS_KEY : null, authedJson);
  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams(window.location.search);
      if (q.get('tab') === 'forms') { setTab('forms'); setFormId(q.get('form')); }
      else if (q.get('tab') === 'meetings') setTab('meetings');
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const kids = data?.children ?? [];
  const child = kids.find((k) => k.linkId === selected) ?? kids[0];
  // A chat from a notification: show the child it's about, on the messages tab.
  useEffect(() => {
    if (!chatId || !kids.length) return;
    let off = false;
    authedJson<{ studentId: string }>(`/api/parent/chats/${encodeURIComponent(chatId)}`).then((c) => {
      if (off) return;
      const k = kids.find((x) => x.studentId === c.studentId);
      if (k) { setSelected(k.linkId); setTab('messages'); }
    }).catch(() => { if (!off) setChatId(null); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the children arrive
  }, [kids.length]);
  const openChat = (id: string | null) => {
    setChatId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('chat', id); else url.searchParams.delete('chat');
    window.history.replaceState(null, '', url);
  };
  const openForm = (id: string | null) => {
    setFormId(id);
    const url = new URL(window.location.href);
    if (id) { url.searchParams.set('tab', 'forms'); url.searchParams.set('form', id); } else url.searchParams.delete('form');
    window.history.replaceState(null, '', url);
  };
  const switchTab = (v: Tab) => {
    setTab(v);
    const url = new URL(window.location.href);
    url.searchParams.delete('form');
    if (v === 'forms' || v === 'meetings') url.searchParams.set('tab', v); else url.searchParams.delete('tab');
    window.history.replaceState(null, '', url);
  };
  const toSign = forms?.waiting ?? 0;
  const unread = notes?.filter((n) => !n.read).length ?? 0;

  const linked = (linkId: string) => { setAdding(false); setSelected(linkId); void mutate(); };

  const unlink = async (c: Child) => {
    if (!(await confirmDialog({ title: `Remove ${c.firstName}?`, message: `You’ll stop seeing ${c.firstName}’s schoolwork. ${c.firstName} is told in the app. To link again, you’ll need a new code from them.`, confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await authedJson(`${KEY}/${c.linkId}`, { method: 'DELETE' });
      void mutate((d) => d && { children: d.children.filter((k) => k.linkId !== c.linkId) }, { revalidate: false });
      setSelected(null);
      toast.success(`${c.firstName} removed`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t remove the link.')); }
  };

  return (
    <main id="main" className="flex-1 overflow-y-auto px-4 py-6 sm:py-10" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <header className="mb-5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-black text-zinc-900 dark:text-white min-h-11">
            <LogoMark className="w-7 h-7" /> UniVerse
            <span className="rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 px-2 py-0.5 text-[11px] font-bold">Parent</span>
          </span>
          <div className="flex items-center gap-1.5">
            {kids.length > 0 && <button type="button" onClick={() => setAdding(true)} className="btn-secondary btn-sm"><UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Add a child</span><span className="sm:hidden">Add</span></button>}
            <button type="button" onClick={() => setSheet('updates')} aria-label={unread ? `Updates, ${unread} new` : 'Updates'} className="relative w-11 h-11 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10">
              <Bell className="w-5 h-5" />
              {unread > 0 && <span aria-hidden className="absolute top-2 right-2 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </button>
            <button type="button" onClick={() => setSheet('account')} aria-label="Account" className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10"><CircleUser className="w-5 h-5" /></button>
          </div>
        </header>

        {error && !data ? <LoadError onRetry={() => mutate()} />
          : isLoading && !data ? <div className="p-8"><ContentSkeleton variant="list" /></div>
          : !child ? <Welcome onLinked={linked} />
          : (
            <>
              {kids.length > 1 && tab !== 'forms' && (
                kids.length <= 4
                  ? <Segmented<string> label="Child" value={child.linkId} onChange={setSelected} segments={kids.map((k) => ({ value: k.linkId, label: k.firstName }))} className="mb-4 w-full" />
                  : <select aria-label="Child" value={child.linkId} onChange={(e) => setSelected(e.target.value)} className="input mb-4">{kids.map((k) => <option key={k.linkId} value={k.linkId}>{k.firstName}</option>)}</select>
              )}
              <Segmented<Tab> label="Show" value={tab} onChange={switchTab} className="mb-4 w-full" segments={[
                // Four tabs fit a phone with the short name.
                { value: 'school', label: <><span className="sm:hidden">School</span><span className="hidden sm:inline">Schoolwork</span></> },
                { value: 'messages', label: 'Messages' },
                { value: 'meetings', label: 'Meetings' },
                { value: 'forms', label: <span className="inline-flex items-center gap-1.5">Forms{toSign > 0 && <><span aria-hidden className="min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold inline-flex items-center justify-center">{toSign}</span><span className="sr-only">, {toSign} to sign</span></>}</span> },
              ]} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab === 'forms' ? 'forms' : `${child.linkId}-${tab}`} variants={fadeUp} initial="hidden" animate="show" exit={{ opacity: 0 }}>
                  {tab === 'forms' ? (
                    <><h1 className="sr-only">Forms to sign</h1><ParentForms formId={formId} onForm={openForm} /></>
                  ) : tab === 'meetings' ? (
                    <><h1 className="sr-only">Meetings with {child.firstName}’s teachers</h1><ParentMeetings studentId={child.studentId} /></>
                  ) : tab === 'messages' ? (
                    <><h1 className="sr-only">Messages with {child.firstName}’s teachers</h1><ParentMessages studentId={child.studentId} chatId={chatId} onChat={openChat} /></>
                  ) : (
                    <>
                      <ChildView data={child} eyebrow={child.relation ? `You’re linked as ${child.relation.toLowerCase()}` : 'Linked to your account'} note="Up to date as of now. Grades, attendance and deadlines come straight from the school." />
                      <div className="mt-6 flex justify-center">
                        <button type="button" onClick={() => void unlink(child)} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><UserMinus className="w-4 h-4" /> Remove {child.firstName}</button>
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}
      </div>

      {adding && (
        <Sheet title="Link another child" onClose={() => setAdding(false)}>
          <LinkForm onLinked={linked} />
        </Sheet>
      )}
      {sheet === 'updates' && <Updates notes={notes ?? []} onClose={() => setSheet(null)} />}
      {sheet === 'account' && <Account onClose={() => setSheet(null)} />}
    </main>
  );
}

function Welcome({ onLinked }: { onLinked: (linkId: string) => void }) {
  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-7">
      <span className="w-12 h-12 rounded-2xl bg-teal-500/10 flex items-center justify-center"><Link2 className="w-6 h-6 text-teal-600 dark:text-teal-300" /></span>
      <h1 className="mt-4 text-2xl font-black text-zinc-900 dark:text-white">Link your child’s account</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">You’ll see their grades, attendance, what’s due and their report cards. Never their messages.</p>
      <ol className="mt-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
        {['Your child opens UniVerse, then Settings → Parent or guardian.', 'They tap “Make a code” and give you the 8-character code.', 'You enter it below. The code works once and lasts 7 days.'].map((s, i) => (
          <li key={i} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>{s}</li>
        ))}
      </ol>
      <div className="mt-6"><LinkForm onLinked={onLinked} /></div>
    </motion.section>
  );
}

function LinkForm({ onLinked }: { onLinked: (linkId: string) => void }) {
  const [code, setCode] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const r = await authedJson<{ linkId: string }>(KEY, { method: 'POST', body: JSON.stringify({ code, relation }) });
      toast.success('Linked');
      onLinked(r.linkId);
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t link with that code.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Code from your child" hint={problem ? undefined : 'Like ABCD-2345. Letters and numbers, no O, I or L.'} error={problem}>
        {(p) => <input {...p} className="input font-mono text-lg tracking-[0.2em] uppercase" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} placeholder="ABCD-2345" value={shown} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)); setProblem(null); }} />}
      </Field>
      <Field label="You are their (optional)">
        {(p) => (
          <select {...p} className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
            <option value="">Choose…</option>
            {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </Field>
      <button type="submit" disabled={busy || code.length !== 8} className="btn-primary w-full">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Link account
      </button>
    </form>
  );
}

function Updates({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  const unread = notes.filter((n) => !n.read).map((n) => n.id);
  // Opening the list marks what's in it as read.
  const [marked] = useState(() => { if (unread.length) void authedJson('/api/notifications', { method: 'PATCH', body: JSON.stringify({ ids: unread }) }).catch(() => {}); return true; });
  return (
    <Sheet title="Updates" onClose={onClose}>
      {!notes.length ? <p className="text-sm text-zinc-500">Nothing yet. You’ll see here when a child links or removes your account.</p> : (
        <ul className="space-y-2" data-marked={marked || undefined}>
          {notes.map((n) => (
            <li key={n.id} className={cn('rounded-2xl p-3 border', n.read ? 'border-zinc-200/70 dark:border-white/[0.07]' : 'border-indigo-500/30 bg-indigo-500/5')}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">{n.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{n.body}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</p>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function Account({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try { const { auth } = await import('@/lib/firebase'); await auth.signOut(); } catch { /* demo or offline */ }
    logout();
    router.push('/login');
  };

  const deleteAccount = async () => {
    const typed = await promptDialog({ title: 'Delete your account?', message: 'Type DELETE to ask for your account and its links to be deleted. Your children’s accounts aren’t affected.', placeholder: 'DELETE', confirmLabel: 'Ask to delete' });
    if (typed == null) return;
    try {
      await api.post('/users/me/deletion', { confirm: typed.trim() });
      toast.success('Request sent', { description: 'We’ll delete your account soon and let you know.' });
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t send the request.')); }
  };

  return (
    <Sheet title="Account" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-zinc-900 dark:text-white">{user?.name}</p>
          <p className="text-sm text-zinc-500">{user?.email}</p>
        </div>
        <button type="button" onClick={() => void signOut()} disabled={busy} className="btn-secondary w-full"><LogOut className="w-4 h-4" /> Sign out</button>
        <button type="button" onClick={() => void deleteAccount()} className="btn-ghost w-full text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete my account</button>
      </div>
    </Sheet>
  );
}
