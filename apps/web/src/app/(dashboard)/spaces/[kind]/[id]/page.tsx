'use client';

import { use, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Code2, Coffee, FileText, KanbanSquare, Loader2, Plus, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Topbar } from '@/components/layout/Topbar';
import { authedJson } from '@/lib/authed-fetch';
import { Avatar } from '@/components/chat/MessageBubble';
import { Contributions } from '@/components/spaces/Contributions';

// One space (Stage 4 · 3.1): a class or a study group, with its call, documents, task boards,
// code rooms (classes) and people. New documents and boards made here belong to the space.

interface Space {
  kind: 'course' | 'group'; id: string; title: string; subtitle: string; canManage: boolean; callId: string; openTasks: number;
  people: { id: string; name: string; avatar: string | null }[];
  docs: { id: string; title: string; preview: string | null; updatedAt: string }[];
  boards: { id: string; title: string; updatedAt: string; tasks: number }[];
  code: { id: string; title: string; language: string; updatedAt: string }[];
}
const card = 'rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl';
const when = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function SpacePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  const router = useRouter();
  const { data, error } = useSWR<Space>(`/api/spaces/${kind}/${id}`, authedJson);
  const [busy, setBusy] = useState<'doc' | 'board' | null>(null);
  if (error) return <div className="p-8 text-sm text-rose-500">{(error as Error).message}</div>;
  if (!data) return <div className="flex-1 p-6"><div className="h-80 rounded-2xl skeleton" /></div>;
  const owner = data.kind === 'course' ? { courseId: data.id } : { groupId: data.id };
  const make = async (what: 'doc' | 'board') => {
    const title = window.prompt(what === 'doc' ? 'Name the document' : 'Name the task board');
    if (!title?.trim()) return;
    setBusy(what);
    try {
      const r = await authedJson<{ id: string }>(what === 'doc' ? '/api/docs' : '/api/tasks', { method: 'POST', body: JSON.stringify({ title: title.trim(), ...owner }) });
      router.push(what === 'doc' ? `/docs/${r.id}` : `/tasks/${r.id}`);
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  };
  const section = (title: string, Icon: typeof FileText, items: { href: string; title: string; meta: string }[], add?: () => void, addBusy?: boolean, empty?: string) => (
    <section className={`${card} p-4 space-y-2`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex-1">{title}</h2>
        {add && <button type="button" onClick={add} disabled={addBusy} className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 inline-flex items-center gap-1">{addBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}New</button>}
      </div>
      {items.length === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : items.map((i) => (
        <Link key={i.href} href={i.href} className="flex items-center gap-2 px-2 py-2 -mx-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05]">
          <span className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-100 truncate">{i.title}</span>
          <span className="text-xs text-zinc-500 shrink-0">{i.meta}</span>
        </Link>
      ))}
    </section>
  );
  return (
    <>
      <Topbar title={data.title} subtitle={data.subtitle} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/spaces" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-indigo-500"><ArrowLeft className="w-4 h-4" />Spaces</Link>
            <span className="flex-1" />
            <div className="flex -space-x-2">{data.people.slice(0, 6).map((p) => <span key={p.id} className="ring-2 ring-white dark:ring-zinc-900 rounded-full"><Avatar name={p.name} src={p.avatar} size={28} /></span>)}</div>
            <span className="text-xs text-zinc-500">{data.people.length}{data.people.length >= 60 ? '+' : ''} people</span>
            <button type="button" onClick={() => router.push(`/hall/h${data.callId}`)} className="btn-secondary" title="A map you walk around with your classmates: voices get louder as you get closer"><Coffee className="w-4 h-4" />Study Hall</button>
            <button type="button" onClick={() => router.push(`/call/${data.callId}`)} className="btn-primary"><Video className="w-4 h-4" />{data.kind === 'course' ? 'Class call' : 'Group call'}</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {section('Documents', FileText, data.docs.map((d) => ({ href: `/docs/${d.id}`, title: d.title, meta: when(d.updatedAt) })), () => void make('doc'), busy === 'doc', 'No documents yet.')}
            {section(`Tasks${data.openTasks ? ` · ${data.openTasks} open` : ''}`, KanbanSquare, data.boards.map((b) => ({ href: `/tasks/${b.id}`, title: b.title, meta: `${b.tasks} card${b.tasks === 1 ? '' : 's'}` })), () => void make('board'), busy === 'board', 'No task boards yet.')}
            {data.kind === 'course' && section('Code rooms', Code2, data.code.map((c) => ({ href: `/code/${c.id}`, title: c.title, meta: when(c.updatedAt) })), () => router.push('/code'), false, 'No code rooms yet.')}
          </div>
          <Contributions kind={data.kind} id={data.id} />
        </div>
      </div>
    </>
  );
}
