'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Mic, MicOff, Send, Volume2 } from 'lucide-react';
import { CHAT_MAX, QUICK_CHAT } from '@/lib/play-chat';
import { cn } from '@/lib/utils';
import type { Net } from '../useGameRoom';

// Chat and voice inside a 3D world (M39), for rooms. The last lines float in the corner and fade;
// Enter (or T) opens the box, the bubble button gives one-tap phrases, and the mic button turns
// proximity voice on (13+; the browser asks for the microphone) and mutes it. What people say also
// shows as a bubble over their character (world/crowd.ts).

const SHOW_MS = 9_000;

export function RoomChat({ net, frame }: { net: Net; frame: React.RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState(false);
  const [text, setText] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const calm = useReducedMotion();
  const { chat, sendChat, chatNotice, voice } = net;

  // Enter or T opens the box (the mouse is freed so you can type); Escape closes it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.key === 'Enter' || e.key.toLowerCase() === 't') && !open) {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  // Old lines fade: a slow tick only while some are still showing.
  const fresh = chat.some((l) => now - l.at < SHOW_MS);
  useEffect(() => {
    if (!fresh && !chat.length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fresh, chat.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) sendChat(text.trim());
    setText(''); setOpen(false);
    frame.current?.focus();
  };
  const shown = open ? chat.slice(-8) : chat.filter((l) => now - l.at < SHOW_MS).slice(-5);

  return (
    <div className="absolute bottom-24 start-3 z-10 w-[min(78%,340px)] [@media(pointer:coarse)]:bottom-40">
      <ul className="space-y-1" aria-live="polite" aria-label="Room chat">
        <AnimatePresence initial={false}>
          {shown.map((l) => (
            <motion.li key={`${l.id}-${l.at}`} layout={!calm} initial={{ opacity: 0, x: calm ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} transition={{ duration: 0.25 }}
              className="w-fit max-w-full rounded-xl bg-black/65 px-2.5 py-1 text-sm text-white ring-1 ring-white/10">
              <span className={cn('me-1.5 font-bold', l.mine ? 'text-pink-300' : 'text-sky-300')} translate="no">{l.mine ? 'You' : l.name}</span>
              <span translate="no">{l.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {[chatNotice, micError].filter(Boolean).map((t) => <p key={t} className="mt-1 w-fit rounded-xl bg-red-950/85 px-2.5 py-1 text-xs font-semibold text-red-100" role="status">{t}</p>)}
      <AnimatePresence>
        {quick && (
          <motion.div initial={{ opacity: 0, y: calm ? 0 : 8, scale: calm ? 1 : 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.18 }}
            className="mt-2 flex flex-wrap gap-1.5" style={{ transformOrigin: 'bottom left' }}>
            {QUICK_CHAT.map((q) => (
              <button key={q} type="button" onClick={() => { sendChat(q); setQuick(false); }} className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-zinc-900 shadow active:scale-95">{q}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-2 flex items-center gap-1.5">
        {open ? (
          <form onSubmit={submit} className="flex flex-1 items-center gap-1.5">
            <label htmlFor="room-chat" className="sr-only">Message the room</label>
            <input id="room-chat" ref={input} value={text} onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX))} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
              placeholder="Say something kind…" autoComplete="off" maxLength={CHAT_MAX} className="h-9 min-w-0 flex-1 rounded-full bg-black/70 px-3.5 text-sm text-white ring-1 ring-white/20 placeholder:text-zinc-400 focus:outline-none focus:ring-pink-400" />
            <button type="submit" className="grid h-9 w-9 place-items-center rounded-full bg-pink-600 text-white"><Send className="h-4 w-4" aria-hidden /><span className="sr-only">Send</span></button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/65 px-3 text-xs font-semibold text-white ring-1 ring-white/15">
              <MessageCircle className="h-4 w-4" aria-hidden />Chat<kbd className="hidden rounded bg-white/15 px-1 font-mono text-[11px] [@media(pointer:fine)]:inline">Enter</kbd>
            </button>
            <button type="button" onClick={() => setQuick((q) => !q)} aria-expanded={quick} className="h-9 rounded-full bg-black/65 px-3 text-xs font-semibold text-white ring-1 ring-white/15">Quick</button>
          </>
        )}
        <button type="button" disabled={!voice.allowed}
          onClick={async () => { if (voice.on) { voice.mute(!voice.muted); return; } setMicError(await voice.toggle()); }}
          title={voice.allowed ? undefined : 'Voice chat is for 13 and over'}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 disabled:opacity-50', voice.on && !voice.muted ? 'bg-emerald-500 text-emerald-950 ring-emerald-300' : 'bg-black/65 text-white ring-white/15')}>
          {voice.on && voice.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          {!voice.allowed ? 'Voice 13+' : voice.on ? (voice.muted ? 'Muted' : 'Voice on') : 'Voice'}
        </button>
        {voice.on && (
          <button type="button" onClick={() => void voice.toggle()} className="grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white ring-1 ring-white/15" title="Leave voice">
            <Volume2 className="h-4 w-4" aria-hidden /><span className="sr-only">Leave voice</span>
          </button>
        )}
      </div>
    </div>
  );
}
