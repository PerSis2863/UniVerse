'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckSquare, FileText, PenTool, Play } from 'lucide-react';
import Link from '@/components/ui/Link';
import { WhenVisible } from '@/components/ui/WhenVisible';
import { authedJson } from '@/lib/authed-fetch';
import type { AppLinkKind } from '@/lib/app-links';
import { cn } from '@/lib/utils';

// Rich link cards in chats (Stage 5 · B7.10): the app's own docs, whiteboards and task boards
// shown live (title, the start of a doc, a board's picture, a task board's progress) for people who
// may open them, loaded when the message comes into view; YouTube videos with their picture, played
// in place (youtube-nocookie).

interface Card { kind: AppLinkKind; title: string; snippet?: string | null; thumbnail?: string | null; progress?: { done: number; total: number; overdue: number } }
const ICON = { doc: FileText, board: PenTool, tasks: CheckSquare } as const;
const LABEL = { doc: 'Doc', board: 'Whiteboard', tasks: 'Tasks' } as const;

function Live({ kind, id, url, mine }: { kind: AppLinkKind; id: string; url: string; mine: boolean }) {
  const { data, error } = useSWR<Card>(`/api/link-card?kind=${kind}&id=${encodeURIComponent(id)}`, authedJson, { revalidateOnFocus: false, shouldRetryOnError: false });
  if (error) return null; // can't open it: the plain link in the message is enough
  const Icon = ICON[kind];
  const path = new URL(url).pathname;
  const pct = data?.progress?.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;
  return (
    <Link href={path} className={cn('mt-2 flex gap-3 rounded-xl border-l-4 px-3 py-2 transition-colors', mine ? 'bg-white/10 border-white/60 hover:bg-white/15' : 'bg-zinc-100 dark:bg-white/[0.05] border-indigo-400 hover:bg-zinc-200/70 dark:hover:bg-white/[0.08]')}>
      {data?.thumbnail && <img src={data.thumbnail} alt="" className="w-16 h-12 rounded-lg object-cover bg-white shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide', mine ? 'text-white/70' : 'text-zinc-500')}><Icon className="w-3 h-3" aria-hidden />{LABEL[kind]} · UniVerse</span>
        <span className="block text-sm font-semibold leading-snug line-clamp-2 mt-0.5">{data?.title ?? 'Loading…'}</span>
        {data?.snippet && <span className={cn('block text-xs leading-snug line-clamp-2 mt-0.5', mine ? 'text-white/80' : 'text-zinc-600 dark:text-zinc-400')}>{data.snippet}</span>}
        {data?.progress && (
          <span className="block mt-1">
            <span className={cn('block h-1.5 rounded-full overflow-hidden', mine ? 'bg-white/20' : 'bg-zinc-200 dark:bg-white/10')} role="img" aria-label={`${data.progress.done} of ${data.progress.total} tasks done`}>
              <span className={cn('block h-full rounded-full', mine ? 'bg-white' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
            </span>
            <span className={cn('block text-[11px] mt-0.5 tabular-nums', mine ? 'text-white/80' : 'text-zinc-500')}>{data.progress.done} of {data.progress.total} done{data.progress.overdue ? ` · ${data.progress.overdue} overdue` : ''}</span>
          </span>
        )}
      </span>
    </Link>
  );
}

export function AppLinkCard(p: { kind: AppLinkKind; id: string; url: string; mine: boolean }) {
  return <WhenVisible placeholder={<span className="mt-2 block h-14 rounded-xl skeleton" />}><Live {...p} /></WhenVisible>;
}

export function YouTubeCard({ id, url, title, mine }: { id: string; url: string; title?: string | null; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const start = (() => { try { const t = new URL(url).searchParams.get('t'); return t ? parseInt(t, 10) || 0 : 0; } catch { return 0; } })();
  return (
    <span className={cn('mt-2 block rounded-xl overflow-hidden', mine ? 'bg-white/10' : 'bg-zinc-100 dark:bg-white/[0.05]')}>
      {playing ? (
        <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ''}`} title={title ?? 'YouTube video'} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="block w-full aspect-video" />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title ?? 'the video'}`} className="relative block w-full aspect-video group">
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/10 group-hover:bg-black/20 transition-colors"><span className="w-12 h-12 rounded-full bg-red-600 text-white grid place-items-center shadow-lg"><Play className="w-5 h-5 ml-0.5 fill-current" aria-hidden /></span></span>
        </button>
      )}
      {title && <span className="block px-3 py-1.5 text-xs font-semibold line-clamp-2">{title}</span>}
    </span>
  );
}
