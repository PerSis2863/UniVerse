'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Presentation } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { card } from './shared';
import { cn } from '@/lib/utils';
import { GUIDE_TITLE, guideHref } from '@/components/boards/guide-title';

// Explain UniVerse: one whiteboard about the whole site (every feature, how it works, the technology),
// made from all ten whiteboard templates (src/components/boards/universe-guide.ts). The first open
// makes the board in the owner's whiteboards; later opens go back to it. "Make a fresh one" starts again.

const PARTS = [
  ['Start here', 'Blank canvas: the banner across the top: what UniVerse is, its numbers, how to read the board'],
  ['Every feature', 'Mind map: everything students, teachers, admins, parents and you can do'],
  ['Where things stand', 'Kanban: done, in progress, and what waits on you'],
  ['Strengths and risks', 'SWOT analysis'],
  ['Website and phone app', 'Venn diagram: what’s the same and what’s different'],
  ['How it was built', 'Timeline: from the first stages to this week'],
  ['The owner’s week', 'Weekly planner: what to check in this console, day by day'],
  ['How it works, technically', 'Cornell notes: Cloudflare, the database, live rooms, sign-in, AI, safety, cost'],
  ['Looking back', 'Retrospective: what went well, what to improve, ideas, actions'],
  ['Showing UniVerse to a school', 'Lesson plan: a 45-minute demo'],
];

export function GuidePanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<'open' | 'fresh' | null>(null);

  const open = async (fresh: boolean) => {
    setBusy(fresh ? 'fresh' : 'open');
    try {
      if (!fresh) {
        const boards = await authedJson<{ id: string; title: string; mine: boolean }[]>('/api/boards');
        const mine = boards.find((b) => b.mine && b.title === GUIDE_TITLE);
        if (mine) return router.push(guideHref(mine.id));
      }
      const board = await authedJson<{ id: string }>('/api/boards', { method: 'POST', body: JSON.stringify({ title: GUIDE_TITLE }) });
      router.push(guideHref(board.id));
    } catch (e) {
      toast.error((e as Error).message || 'The whiteboard couldn’t be opened.');
      setBusy(null);
    }
  };

  return (
    <div className={cn(card, 'p-6 sm:p-8')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="font-semibold text-xl text-zinc-900 dark:text-white flex items-center gap-2"><Presentation className="w-5 h-5 text-violet-500" /> UniVerse, explained on one whiteboard</h2>
          <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">Every feature, how things work and the technology underneath, in ten areas: one for each whiteboard template. It opens in Collaborate → Whiteboards, where you can edit it, present it or share it like any board.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void open(false)} disabled={!!busy} className="btn-primary">
            {busy === 'open' && <Loader2 className="w-4 h-4 animate-spin" />} Open the whiteboard
          </button>
          <button type="button" onClick={() => void open(true)} disabled={!!busy} className="btn-secondary">
            {busy === 'fresh' && <Loader2 className="w-4 h-4 animate-spin" />} Make a fresh one
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">“Make a fresh one” draws the latest version (packed edge to edge, everything up to date). An older copy stays in Whiteboards until you delete it.</p>
      <ol className="mt-6 grid sm:grid-cols-2 gap-3">
        {PARTS.map(([title, what], i) => (
          <li key={title} className="flex gap-3 rounded-2xl border border-[var(--card-border)] p-3.5">
            <span className="w-7 h-7 shrink-0 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <span><span className="block text-sm font-semibold text-zinc-900 dark:text-white">{title}</span><span className="block text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{what}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
}
