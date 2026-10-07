'use client';

import dynamic from 'next/dynamic';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';

// A whiteboard inside a call (Stage 4 · 3.4): the board itself (BoardCanvas, the same live board as
// /boards/<id>) in a panel over the call. The board is made for the call and its link shared in
// the call's chat, which is how everyone in the call finds it; anyone signed in with the link can
// draw (link access "EDIT").

const BoardCanvas = dynamic(() => import('@/components/boards/BoardCanvas'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center text-sm text-white/60 gap-2"><Loader2 className="w-4 h-4 animate-spin" />Opening the whiteboard…</div>,
});

const BOARD_LINK = /\/boards\/([a-z0-9]{20,32})\b/;
/** The latest whiteboard link shared in the call's chat, if any. */
export function boardFromChat(lines: { text: string }[]): string | null {
  for (let i = lines.length - 1; i >= 0; i--) { const m = BOARD_LINK.exec(lines[i].text); if (m) return m[1]; }
  return null;
}

/** Makes a whiteboard for the call (anyone with the link can draw) and returns its id. */
export async function makeCallBoard(title: string): Promise<string> {
  const b = await authedJson<{ id: string }>('/api/boards', { method: 'POST', body: JSON.stringify({ title: `${title} · whiteboard`.slice(0, 120) }) });
  await authedJson(`/api/boards/${b.id}`, { method: 'PATCH', body: JSON.stringify({ linkAccess: 'EDIT' }) });
  return b.id;
}

const noop = () => {};

export function CallBoardPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  return (
    <motion.section initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={spring.smooth}
      aria-label="Whiteboard" className="fixed inset-y-0 right-0 z-[330] w-full md:w-[min(64vw,1100px)] flex flex-col bg-[#121212] border-l border-white/10 shadow-2xl">
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-white/10 text-white">
        <p className="flex-1 text-sm font-semibold">Whiteboard</p>
        <a href={`/boards/${boardId}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-white/10" aria-label="Open in a new tab" title="Open in a new tab"><ExternalLink className="w-4 h-4" /></a>
        <button type="button" onClick={onClose} aria-label="Close the whiteboard" className="p-2 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 min-h-0">
        <BoardCanvas boardId={boardId} title="Whiteboard" canEdit theme="dark" onControls={noop} onBackground={noop} onPeers={noop} onStatus={noop} onRole={noop} onGone={() => { toast.error('This whiteboard isn’t available.'); onClose(); }} onError={(m) => toast.error(m)} />
      </div>
    </motion.section>
  );
}
