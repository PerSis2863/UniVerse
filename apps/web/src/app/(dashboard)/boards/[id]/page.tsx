'use client';

import { use, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Eye, ImageIcon, ImageOff, ImagePlus, Loader2, PenTool, Share2, Sparkles, Trash2, Wallpaper } from 'lucide-react';
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
import type { BoardControls, BoardGone, BoardPeer, LiveStatus } from '@/components/boards/BoardCanvas';
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
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500 gap-2"><ImageIcon className="w-4 h-4" /> Loading board…</div>
        )}
      </main>

      {sharing && board && <ShareBoardDialog board={{ ...board, myRole }} onClose={() => setSharing(false)} onChanged={() => mutate()} />}
    </div>
  );
}
