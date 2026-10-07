'use client';

import { use, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowLeft, BarChart3, FileDown, ThumbsUp, ChevronLeft, ChevronRight, Copy, Eye, ImageIcon, ImageOff, ImagePlus, Loader2, MonitorUp, PenTool, Share2, Sparkles, Timer as TimerIcon, Trash2, Wallpaper } from 'lucide-react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { spring } from '@/lib/motion';
import { Sheet } from '@/components/chat/ChatDialogs';
import { drawMindMap, drawSummary, drawThemes } from '@/components/boards/board-ai-draw';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from '@/components/ui/Link';
import { authedJson } from '@/lib/authed-fetch';
import { confirmDialog, promptDialog } from '@/components/ui/Dialogs';
import { Avatar } from '@/components/chat/MessageBubble';
import { ShareBoardDialog, type BoardMeta } from '@/components/boards/ShareBoardDialog';
import type { BoardControls, BoardGone, BoardPeer, LiveStatus, Presenting } from '@/components/boards/BoardCanvas';
import { MAX_VOTES, type Voted } from '@/components/boards/votes';
import type { TemplateId } from '@/components/boards/templates';
import { cn } from '@/lib/utils';

const BoardCanvas = dynamic(() => import('@/components/boards/BoardCanvas'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-sm text-zinc-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Opening the canvas…</div>,
});

// Follows the site's light/dark switch (a "dark" class on <html>).
function useDarkMode() {
  return useSyncExternalStore(
    (onChange) => {
      const o = new MutationObserver(onChange);
      o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => o.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

const STATUS: Record<LiveStatus, { label: string; dot: string }> = {
  connecting: { label: 'Connecting…', dot: 'bg-amber-400' },
  live: { label: 'Live', dot: 'bg-emerald-500' },
  offline: { label: 'Reconnecting…', dot: 'bg-amber-400 animate-pulse' },
  unavailable: { label: 'Live editing unavailable', dot: 'bg-rose-500' },
};

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const dark = useDarkMode();
  const { data: board, error, mutate } = useSWR<BoardMeta>(`/api/boards/${id}`, authedJson);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [peers, setPeers] = useState<BoardPeer[]>([]);
  const [role, setRole] = useState<BoardMeta['myRole'] | null>(null);
  const [gone, setGone] = useState<BoardGone | null>(null);
  const [sharing, setSharing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const controls = useRef<BoardControls | null>(null);
  // Presenting and the workshop timer (3.4).
  const [presentState, setPresentState] = useState<Presenting | null>(null);
  const [follow, setFollow] = useState(true);
  const [slides, setSlides] = useState<{ id: string; name: string }[]>([]);
  const [slide, setSlide] = useState(0);
  const [timer, setTimer] = useState<{ endsAt: number; by: string } | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const startPresenting = () => {
    const c = controls.current;
    if (!c) return;
    const frames = c.frames();
    setSlides(frames);
    setSlide(0);
    c.present(true);
    if (frames.length) c.showFrame(frames[0].id);
    toast.success(frames.length ? `Presenting ${frames.length} slides: everyone following sees your screen` : 'Presenting: everyone following sees what you see. Add frames to make slides.');
  };
  const goSlide = (i: number) => {
    if (!slides[i]) return;
    setSlide(i);
    controls.current?.showFrame(slides[i].id);
  };
  // Dot voting and PDF export (3.4).
  const [votes, setVotes] = useState<Voted[]>([]);
  const [votesOpen, setVotesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const vote = () => { const why = controls.current?.vote(); if (why) toast(why); };
  const exportPdf = async () => {
    const c = controls.current;
    if (!c) return;
    // Opened now (a click), filled when the pictures are ready: pop-up blockers allow it.
    const win = window.open('', '_blank');
    if (!win) return toast.error('Allow pop-ups to export the board.');
    win.document.title = board?.title ?? 'Board';
    win.document.body.textContent = 'Preparing the PDF…';
    setExporting(true);
    try {
      const pages = await c.exportPages();
      const doc = win.document;
      doc.body.textContent = '';
      const style = doc.createElement('style');
      style.textContent = '@page { size: landscape; margin: 10mm } body { margin: 0 } img { display: block; max-width: 100%; max-height: 180mm; margin: 0 auto; page-break-after: always } img:last-child { page-break-after: auto }';
      doc.head.appendChild(style);
      for (const src of pages) { const img = doc.createElement('img'); img.src = src; doc.body.appendChild(img); }
      setTimeout(() => win.print(), 400);
    } catch (e) { win.close(); toast.error((e as Error).message || 'Couldn’t export the board.'); } finally { setExporting(false); }
  };
  // AI on boards (3.5): one AI request per action; the result is drawn by this browser.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ title: string; summary: string; nextSteps: string[] } | null>(null);
  const runAi = async (action: 'themes' | 'mindmap' | 'summary') => {
    setAiOpen(false);
    const c = controls.current;
    if (!c) return;
    const texts = c.texts();
    let topic: string | null = null;
    if (action === 'mindmap') {
      topic = (await promptDialog({ title: 'Mind map about…', placeholder: 'e.g. Causes of the French Revolution', confirmLabel: 'Make it', maxLength: 200 }))?.trim() ?? null;
      if (!topic) return;
    }
    setAiBusy(action);
    try {
      const r = await authedJson<Record<string, unknown>>(`/api/boards/${id}/ai`, { method: 'POST', body: JSON.stringify({ action, texts, topic }) });
      if (action === 'themes') {
        const themes = r.themes as { name: string; notes: number[] }[];
        c.addElements(drawThemes(themes, texts));
        toast.success(`Grouped into ${themes.length} themes`);
      } else if (action === 'mindmap') {
        c.addElements(drawMindMap(r as unknown as { center: string; branches: { label: string; ideas: string[] }[] }));
        toast.success('Mind map added');
      } else setSummary(r as unknown as { title: string; summary: string; nextSteps: string[] });
    } catch (e) { toast.error((e as Error).message); } finally { setAiBusy(null); }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const photoMode = useRef<'background' | 'photo'>('photo');
  const [hasBg, setHasBg] = useState(false);
  // ?template=… from "New board": used once, on the first open of the empty board.
  const template = useSearchParams().get('template') as TemplateId | null;

  const myRole = role ?? board?.myRole ?? 'VIEWER';
  const canEdit = myRole !== 'VIEWER';

  const onPeers = useCallback((list: BoardPeer[]) => setPeers(list), []);
  const onRole = useCallback((r: BoardMeta['myRole']) => {
    setRole((prev) => {
      if (prev && prev !== r) void mutate();
      return r;
    });
  }, [mutate]);
  const onGone = useCallback((why: BoardGone) => setGone(why), []);
  const onError = useCallback((m: string) => toast.error(m), []);
  const onControls = useCallback((c: BoardControls | null) => { controls.current = c; }, []);

  const pickPhoto = (mode: 'background' | 'photo') => {
    photoMode.current = mode;
    fileInput.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !controls.current) return;
    setPhotoBusy(true);
    try {
      if (photoMode.current === 'background') {
        await controls.current.setBackground(file);
        toast.success('Background photo set', { description: 'It’s locked so you can draw on top. Right-click it to unlock.' });
      } else {
        await controls.current.addPhoto(file);
      }
    } catch (err) {
      toast.error((err as Error).message || 'Couldn’t add that picture.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const rename = async () => {
    if (!board || !canEdit) return;
    const title = await promptDialog({ title: 'Rename board', defaultValue: board.title, confirmLabel: 'Rename', maxLength: 120 });
    if (!title?.trim() || title.trim() === board.title) return;
    mutate({ ...board, title: title.trim() }, { revalidate: false });
    try {
      await authedJson(`/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    } catch (e) {
      toast.error((e as Error).message);
      mutate();
    }
  };

  const copyBoard = async () => {
    try {
      const b = await authedJson<{ id: string }>(`/api/boards/${id}/copy`, { method: 'POST' });
      toast.success('Copy created');
      router.push(`/boards/${b.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async () => {
    if (!board || !(await confirmDialog({ title: `Delete “${board.title}”?`, message: 'The board is deleted for everyone it is shared with. This can’t be undone.', confirmLabel: 'Delete', destructive: true }))) return;
    try {
      await authedJson(`/api/boards/${id}`, { method: 'DELETE' });
      router.push('/boards');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (gone || (error && (error as { status?: number }).status === 404)) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-400"><PenTool className="w-7 h-7" /></div>
          <h1 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">{gone === 'deleted' ? 'This board was deleted' : 'You can’t open this board'}</h1>
          <p className="mt-1 text-sm text-zinc-500">{gone === 'deleted' ? 'The owner deleted it.' : 'It doesn’t exist, or it hasn’t been shared with you. Ask the owner to share it.'}</p>
          <Link href="/boards" className="btn-primary mt-5"><ArrowLeft className="w-4 h-4" /> My boards</Link>
        </div>
      </div>
    );
  }
  if (error) {
    return <div className="flex-1 flex items-center justify-center p-8 text-sm text-rose-500">Couldn’t open the board. <button onClick={() => mutate()} className="ml-1 underline font-semibold">Try again</button></div>;
  }

  const others = peers.filter((p, i, all) => all.findIndex((x) => x.userId === p.userId) === i);
  const btn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-[#121212]">
      <header className="flex items-center gap-2 px-2 sm:px-3 h-14 border-b border-zinc-200 dark:border-white/[0.08] bg-white/95 dark:bg-zinc-950/95 backdrop-blur shrink-0">
        <Link href="/boards" aria-label="Back to boards" className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="min-w-0 flex-1">
          <button onClick={rename} disabled={!canEdit} className="block max-w-full text-left font-bold text-zinc-900 dark:text-white truncate disabled:cursor-default" title={canEdit ? 'Rename' : undefined}>
            {board?.title ?? 'Whiteboard'}
          </button>
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS[status].dot)} /> {STATUS[status].label}
            {!canEdit && <span className="inline-flex items-center gap-1 ml-1"><Eye className="w-3 h-3" /> View only</span>}
          </p>
        </div>

        <div className="hidden sm:flex -space-x-2 mr-1" aria-label={`${others.length} people here`}>
          {others.slice(0, 5).map((p) => (
            <div key={p.userId} title={p.name} className="rounded-full ring-2" style={{ ['--tw-ring-color' as string]: p.color }}>
              <Avatar name={p.name} src={p.avatar} size={28} />
            </div>
          ))}
          {others.length > 5 && <span className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[11px] font-bold flex items-center justify-center text-zinc-600 dark:text-zinc-300 ring-2 ring-white dark:ring-zinc-950">+{others.length - 5}</span>}
        </div>

        {canEdit && (
          <>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onFile} />
            <button onClick={() => pickPhoto('photo')} disabled={photoBusy || status !== 'live'} className={btn} title="Add a photo">
              {photoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}<span className="hidden md:inline">Photo</span>
            </button>
            <button onClick={() => pickPhoto('background')} disabled={photoBusy || status !== 'live'} className={btn} title="Set a background photo">
              <Wallpaper className="w-4 h-4" /><span className="hidden md:inline">Background</span>
            </button>
            {hasBg && (
              <button onClick={() => controls.current?.removeBackground()} className={btn} title="Remove the background photo">
                <ImageOff className="w-4 h-4" /><span className="hidden lg:inline">Remove background</span>
              </button>
            )}
          </>
        )}
        {canEdit && (
          presentState?.mine
            ? <button onClick={() => { controls.current?.present(false); setPresentState(null); }} className={cn(btn, 'text-rose-600 dark:text-rose-400')} title="Stop presenting"><MonitorUp className="w-4 h-4" /><span className="hidden md:inline">Stop</span></button>
            : <button onClick={startPresenting} disabled={status !== 'live'} className={btn} title="Present: frames become slides, and everyone following sees your screen"><MonitorUp className="w-4 h-4" /><span className="hidden md:inline">Present</span></button>
        )}
        {canEdit && <button onClick={vote} disabled={status !== 'live'} className={btn} title={`Vote for the selected note (${MAX_VOTES} votes each)`}><ThumbsUp className="w-4 h-4" /><span className="hidden lg:inline">Vote</span></button>}
        {votes.length > 0 && <button onClick={() => setVotesOpen((o) => !o)} className={cn(btn, votesOpen && 'bg-zinc-100 dark:bg-white/[0.06]')} title="Results of the vote"><BarChart3 className="w-4 h-4" /><span className="text-xs tabular-nums">{votes.reduce((t, v) => t + v.count, 0)}</span></button>}
        <button onClick={() => void exportPdf()} disabled={exporting || status !== 'live'} className={cn(btn, 'hidden sm:inline-flex')} title="Export to PDF (each frame is a page)">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}<span className="hidden lg:inline">PDF</span></button>
        <div className="relative">
          <button onClick={() => setTimerOpen((o) => !o)} disabled={status !== 'live' || !canEdit} className={btn} title="Workshop timer for everyone" aria-expanded={timerOpen}><TimerIcon className="w-4 h-4" /></button>
          <AnimatePresence>
            {timerOpen && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring.snappy} className="absolute right-0 top-11 z-40 w-44 rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl p-1.5">
                {[1, 3, 5, 10, 15].map((m) => <button key={m} type="button" onClick={() => { controls.current?.setTimer(m); setTimerOpen(false); }} className="w-full text-left px-3 py-1.5 rounded-xl text-sm hover:bg-zinc-100 dark:hover:bg-white/[0.06]">{m} {m === 1 ? 'minute' : 'minutes'}</button>)}
                {timer && <button type="button" onClick={() => { controls.current?.setTimer(null); setTimerOpen(false); }} className="w-full text-left px-3 py-1.5 rounded-xl text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-500/10">Stop the timer</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="relative">
          <button onClick={() => setAiOpen((o) => !o)} disabled={!!aiBusy || status !== 'live'} className={btn} title="AI on this board" aria-expanded={aiOpen}>
            {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}<span className="hidden md:inline">AI</span>
          </button>
          <AnimatePresence>
            {aiOpen && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={spring.snappy}
                className="absolute right-0 top-11 z-40 w-64 rounded-2xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-2xl p-1.5">
                {canEdit && <button type="button" onClick={() => void runAi('themes')} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Group notes into themes</span><span className="block text-xs text-zinc-500">Adds the sticky notes again, sorted into columns</span></button>}
                {canEdit && <button type="button" onClick={() => void runAi('mindmap')} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Mind map from a topic…</span><span className="block text-xs text-zinc-500">Draws a mind map beside your board</span></button>}
                <button type="button" onClick={() => void runAi('summary')} className="w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06]"><span className="block text-sm font-semibold text-zinc-900 dark:text-white">Summarise this board</span><span className="block text-xs text-zinc-500">A summary and next steps</span></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={copyBoard} className={cn(btn, 'hidden sm:inline-flex')} title="Make your own copy"><Copy className="w-4 h-4" /><span className="hidden lg:inline">Copy</span></button>
        {myRole === 'OWNER' && <button onClick={remove} className={cn(btn, 'hidden sm:inline-flex text-rose-500 dark:text-rose-400')} title="Delete board"><Trash2 className="w-4 h-4" /></button>}
        <button onClick={() => setSharing(true)} disabled={!board} className="btn-primary btn-sm">
          <Share2 className="w-4 h-4" /> Share
        </button>
      </header>

      {summary && (
        <Sheet title={summary.title || 'Board summary'} onClose={() => setSummary(null)}
          footer={canEdit ? <button type="button" onClick={() => { controls.current?.addElements(drawSummary(summary)); setSummary(null); toast.success('Summary added to the board'); }} className="btn-primary w-full">Add to the board</button> : undefined}>
          <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line leading-relaxed">{summary.summary}</p>
          {summary.nextSteps.length > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Next steps</p>
              <ul className="mt-1.5 space-y-1 text-sm text-zinc-700 dark:text-zinc-200 list-disc pl-5">{summary.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
          <p className="mt-4 text-[11px] text-zinc-400 inline-flex items-center gap-1"><Sparkles className="w-3 h-3" />Made with AI from the text on the board</p>
        </Sheet>
      )}
      <main className="flex-1 min-h-0 relative">
        {/* Presenting, following and the timer (3.4), floating over the board. */}
        <div className="pointer-events-none absolute top-3 inset-x-0 z-30 flex flex-col items-center gap-2 px-3">
          <AnimatePresence>
            {timer && <TimerPill key="timer" endsAt={timer.endsAt} by={timer.by} onDone={() => setTimer(null)} />}
            {presentState?.mine && slides.length > 0 && (
              <motion.div key="slides" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.smooth} className="pointer-events-auto flex items-center gap-1 rounded-full bg-zinc-900/90 text-white px-2 py-1 shadow-xl backdrop-blur">
                <button type="button" aria-label="Previous slide" disabled={slide === 0} onClick={() => goSlide(slide - 1)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-semibold px-1 tabular-nums">{slides[slide]?.name} · {slide + 1}/{slides.length}</span>
                <button type="button" aria-label="Next slide" disabled={slide >= slides.length - 1} onClick={() => goSlide(slide + 1)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </motion.div>
            )}
            {presentState && !presentState.mine && presentState.name && (
              <motion.div key="following" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.smooth} className="pointer-events-auto flex items-center gap-2 rounded-full bg-indigo-600/95 text-white pl-3 pr-1 py-1 shadow-xl text-xs font-semibold">
                <MonitorUp className="w-3.5 h-3.5" />{presentState.name.split(' ')[0]} is presenting
                <button type="button" onClick={() => { const on = !follow; setFollow(on); controls.current?.follow(on); }} className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25">{follow ? 'Stop following' : 'Follow'}</button>
              </motion.div>
            )}
            {votesOpen && votes.length > 0 && (
              <motion.div key="votes" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.smooth} className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#121830]/95 border border-zinc-200 dark:border-white/10 shadow-2xl p-3 backdrop-blur">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Votes</p>
                <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                  {votes.map((v) => (
                    <motion.li key={v.id} layout className="flex items-center gap-2 text-sm">
                      <span className={cn('min-w-7 h-6 px-1.5 rounded-full text-xs font-bold flex items-center justify-center', v.mine ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-200')}>{v.count}</span>
                      <span className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-100">{v.label}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {board ? (
          <BoardCanvas
            boardId={id}
            title={board.title}
            canEdit={canEdit}
            template={template}
            theme={dark ? 'dark' : 'light'}
            onControls={onControls}
            onBackground={setHasBg}
            onPeers={onPeers}
            onStatus={setStatus}
            onRole={onRole}
            onGone={onGone}
            onError={onError}
            onPresent={setPresentState}
            onTimer={setTimer}
            onVotes={setVotes}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500 gap-2"><ImageIcon className="w-4 h-4" /> Loading board…</div>
        )}
      </main>

      {sharing && board && <ShareBoardDialog board={{ ...board, myRole }} onClose={() => setSharing(false)} onChanged={() => mutate()} />}
    </div>
  );
}

/** The workshop timer everyone on the board sees (3.4), with a soft chime at the end. */
function TimerPill({ endsAt, by, onDone }: { endsAt: number; by: string; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (left > 0 || done.current) return;
    done.current = true;
    try {
      const ctx = new AudioContext();
      for (const [i, f] of [660, 880].entries()) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.25); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.5);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.25); o.stop(ctx.currentTime + i * 0.25 + 0.5);
      }
    } catch { /* no sound */ }
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [left, onDone]);
  return (
    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={spring.smooth}
      className={cn('pointer-events-auto rounded-full px-4 py-1.5 shadow-xl text-sm font-bold tabular-nums inline-flex items-center gap-2', left === 0 ? 'bg-emerald-600 text-white' : left <= 30 ? 'bg-amber-500 text-white' : 'bg-zinc-900/90 text-white')}
      title={`Timer started by ${by}`} role="timer" aria-live="polite">
      <TimerIcon className="w-4 h-4" />{left === 0 ? 'Time’s up!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
    </motion.div>
  );
}
