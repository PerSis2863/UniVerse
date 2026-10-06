'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { m as motion, useMotionValue, useTransform } from 'framer-motion';
import { Ban, BarChart3, Eye, ExternalLink, Flame, Check, CheckCheck, Copy, CornerUpLeft, CornerUpRight, Download, EyeOff, FileText, Info, MapPin, MessageCircle, MoreVertical, Pause, Pencil, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, SmilePlus, Star, StarOff, Trash2, Video, Pin, PinOff, Languages, Loader2, ImageIcon, ShieldCheck, X } from 'lucide-react';
import { languageName } from '@/lib/languages';
import { useLowData } from '@/store/low-data';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { type ChatMessage, REACTIONS, formatBytes, plainText } from './chat-client';
import { RichText } from './RichText';
import { EmojiGlyph, EmojiPicker } from './EmojiPicker';
import { safeHref } from '@/lib/safe-href';
import { authedJson } from '@/lib/authed-fetch';

// Each person keeps the same colour everywhere, so a list of chats is easy to scan.
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-violet-500', 'from-sky-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500', 'from-fuchsia-500 to-purple-500', 'from-blue-500 to-indigo-500', 'from-lime-500 to-emerald-500',
];
function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function Avatar({ name, src, size = 40, online }: { name: string; src?: string | null; size?: number; online?: boolean }) {
  const letters = name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  // A photo that fails to load (deleted, blocked, offline) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src && failed !== src ? (
        <img loading="lazy" decoding="async" src={src} alt="" onError={() => setFailed(src)} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className={cn('w-full h-full rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold', avatarGradient(name))} style={{ fontSize: size * 0.36 }}>
          {letters}
        </div>
      )}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#121830]" />}
    </div>
  );
}

/** Voice-note player: play/pause, scrubbable progress and 1× / 1.5× / 2× speed. */
export function VoicePlayer({ src, mine, durationSec }: { src: string; mine: boolean; durationSec?: number }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(durationSec ?? 0);
  const [rate, setRate] = useState(1);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; }, [rate]);
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); };
  return (
    <div className="flex items-center gap-2.5 px-3 pt-2.5 w-64 max-w-full">
      <audio
        ref={audio} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
      />
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', mine ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white')}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range" min={0} max={dur || 1} step={0.1} value={pos} aria-label="Seek"
          onChange={(e) => { const t = Number(e.target.value); setPos(t); if (audio.current) audio.current.currentTime = t; }}
          className={cn('w-full h-1 cursor-pointer', mine ? 'accent-white' : 'accent-indigo-600')}
        />
        <div className={cn('text-[10px] tabular-nums mt-0.5', mine ? 'text-white/70' : 'text-zinc-500')}>{fmt(playing || pos ? pos : dur)}</div>
      </div>
      <button onClick={() => setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1))} aria-label="Playback speed" className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0', mine ? 'bg-white/20' : 'bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300')}>
        {rate}×
      </button>
    </div>
  );
}

interface Props {
  m: ChatMessage;
  mine: boolean;
  me: string;
  showSender: boolean;
  readState: 'sent' | 'delivered' | 'read' | null;
  canModerate: boolean;
  highlight?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteForMe: () => void;
  onStar: () => void;
  /** Present when this person may pin messages here. */
  onPin?: () => void;
  onForward: () => void;
  onInfo: () => void;
  onVote: (option: number) => void;
  onOpenContact: (userId: string) => void;
  onReact: (emoji: string) => void;
  onOpenImage: (url: string) => void;
  /** Translation of this message, when one was asked for or auto-translate is on. */
  translation?: TranslationState;
  /** The reader chose to see the original instead of the translation. */
  showOriginal?: boolean;
  onTranslate?: () => void;
  /** Starts a new call of this kind in the chat (Call back on a finished call). */
  onCallBack?: (kind: 'audio' | 'video') => void;
  onToggleOriginal?: () => void;
  /** Opens this message's thread (Discord-style); absent inside a thread or where threads don't apply. */
  onThread?: () => void;
  /** A community channel's own emoji (name → picture). */
  customEmoji?: Record<string, string>;
}

export type TranslationState = { status: 'pending' } | { status: 'error'; message?: string } | { status: 'done'; text: string; from: string; same: boolean };

const FORWARDABLE = new Set(['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACT']);

export function MessageBubble(p: Props) {
  const { m, mine, me, showSender, readState, canModerate, highlight } = p;
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [fullPicker, setFullPicker] = useState(false);
  const [history, setHistory] = useState(false);
  const [touch, setTouch] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const x = useMotionValue(0);
  const replyHint = useTransform(x, [0, 60], [0, 1]);
  useEffect(() => { setTouch(window.matchMedia('(pointer: coarse)').matches); }, []);

  const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const deleted = m.type === 'DELETED';
  const age = Date.now() - new Date(m.createdAt).getTime();
  const canEdit = mine && m.type === 'TEXT' && !deleted && age < 86_400_000;
  // Delete for everyone: your own for 48 hours; admins and moderators any time.
  const canDeleteForAll = canModerate || (mine && age < 48 * 3_600_000);
  const reactionEntries = Object.entries(m.reactions ?? {}).filter(([, users]) => users.length > 0);
  const interactive = !deleted && !m.pending;

  if (m.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        {m.metadata?.team ? (
          <span className="text-xs px-3.5 py-1.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-200 text-center max-w-[85%] whitespace-pre-wrap break-words inline-flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0" /> {m.body}
          </span>
        ) : (
          <span className="text-[11px] px-3 py-1 rounded-full bg-zinc-200/70 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 text-center max-w-[85%]">{m.body}</span>
        )}
      </div>
    );
  }

  const bubble = cn(
    // iMessage: your messages filled with the tint, theirs in system grey; 20px corners with a tight corner by the sender.
    'relative min-w-0 max-w-full rounded-[20px] text-[15px] leading-[1.35]',
    mine
      ? 'bg-tint text-white rounded-br-[6px]'
      : 'bg-[#e9e9eb] dark:bg-[#26252a] text-zinc-900 dark:text-white rounded-bl-[6px]',
    m.pending && 'opacity-60',
    highlight && 'ring-4 ring-amber-400/70',
  );

  const meta = (
    <span className={cn('inline-flex items-center gap-1 text-[10px] leading-none select-none whitespace-nowrap', mine ? 'text-white/70' : 'text-zinc-400')}>
      {m.starred && <Star className="w-3 h-3 fill-current" />}
      {m.expiresAt && <span title="Disappearing message">⏱</span>}
      {m.editedAt && !deleted && (m.metadata?.moderated === 'edited' ? 'edited by UniVerse ·' : (
        <button type="button" onClick={(e) => { e.stopPropagation(); setHistory(true); }} className="underline-offset-2 hover:underline" title="See the earlier versions">edited ·</button>
      ))} {time}
      {mine && !deleted && (m.pending ? <Check className="w-3 h-3 opacity-60" aria-label="Sending" /> : readState === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" aria-label="Read" /> : readState === 'delivered' ? <CheckCheck className="w-3.5 h-3.5" aria-label="Delivered" /> : <Check className="w-3.5 h-3.5" aria-label="Sent" />)}
    </span>
  );

  let content: React.ReactNode;
  if (deleted) {
    content = m.metadata?.moderated === 'removed'
      ? <p className="px-3.5 py-2.5 italic opacity-70 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Removed by UniVerse</p>
      : <p className="px-3.5 py-2.5 italic opacity-70 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> This message was deleted</p>;
  } else if (m.metadata?.viewOnce && (m.type === 'IMAGE' || m.type === 'VIDEO' || m.type === 'AUDIO')) {
    content = <ViewOnce m={m} mine={mine} />;
  } else if (m.type === 'IMAGE' && m.attachmentUrl) {
    content = (
      <ChatPhoto url={m.attachmentUrl} name={m.attachmentName} size={m.attachmentSize} mine={mine} onOpen={() => p.onOpenImage(m.attachmentUrl!)} />
    );
  } else if (m.type === 'VIDEO' && m.attachmentUrl) {
    content = <ChatVideo url={m.attachmentUrl} />;
  } else if (m.type === 'AUDIO' && m.attachmentUrl) {
    content = (
      <div>
        {m.metadata?.voicemail && <p className={cn('px-3 pt-2.5 text-[11px] font-semibold flex items-center gap-1', mine ? 'text-white/80' : 'text-indigo-500')}><PhoneMissed className="w-3 h-3" /> Voicemail</p>}
        <VoicePlayer src={m.attachmentUrl} mine={mine} durationSec={m.metadata?.durationSec} />
        <VoiceTranscript id={m.id} transcript={m.metadata?.transcript} mine={mine} pending={!!m.pending} />
      </div>
    );
  } else if (m.type === 'FILE' && m.attachmentUrl) {
    content = (
      <a href={safeHref(m.attachmentUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 w-64 max-w-full">
        <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', mine ? 'bg-white/15' : 'bg-indigo-500/10 text-indigo-500')}>
          <FileText className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{m.attachmentName || 'File'}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>{formatBytes(m.attachmentSize)}</span>
        </span>
        <Download className="w-4 h-4 opacity-70" />
      </a>
    );
  } else if (m.type === 'CALL') {
    // A call reads like a phone's call log: live (Join), how long it lasted, missed, no answer
    // or declined. Calls from before UniVerse had its own (Jitsi links) show as ended.
    const meta = m.metadata ?? {};
    const video = meta.kind === 'video';
    const live = !!meta.inApp && !meta.endedAt && Date.now() - new Date(m.createdAt).getTime() < 4 * 3600_000;
    const dur = meta.durationSec ? `${Math.floor(meta.durationSec / 60)}:${String(meta.durationSec % 60).padStart(2, '0')}` : null;
    const missed = !live && !mine && !meta.answered;
    const title = live ? (video ? 'Video call' : 'Voice call')
      : meta.answered && dur ? `${video ? 'Video' : 'Voice'} call · ${dur}`
      : meta.declinedBy ? (mine ? `Declined by ${meta.declinedBy.split(' ')[0]}` : 'You declined')
      : mine ? 'No answer' : `Missed ${video ? 'video' : 'voice'} call`;
    const sub = live ? (mine ? 'You started a call' : `${m.sender.name.split(' ')[0]} is calling`) : mine ? 'Outgoing' : 'Incoming';
    const Icon = live ? (video ? Video : Phone) : missed ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
    content = (
      <div className="flex items-center gap-3 p-3 w-[17rem] max-w-full">
        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', missed ? 'bg-rose-500/15 text-rose-500' : mine ? 'bg-white/15' : 'bg-emerald-500/15 text-emerald-500', live && 'animate-pulse')}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn('block font-semibold leading-tight line-clamp-2', missed && !mine && 'text-rose-500')}>{title}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>{sub}</span>
        </span>
        {live ? (
          <a href={`/call/${m.id}`} className={cn('shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95', mine ? 'bg-white text-indigo-600' : 'bg-emerald-500 text-white')}>
            {mine ? 'Rejoin' : 'Join'}
          </a>
        ) : p.onCallBack ? (
          <button type="button" onClick={() => p.onCallBack?.(video ? 'video' : 'audio')} className={cn('shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95', mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20')}>
            Call back
          </button>
        ) : null}
      </div>
    );
  } else if (m.type === 'POLL') {
    const options = m.metadata?.options ?? [];
    const counts = m.poll?.counts ?? options.map(() => 0);
    const mineVotes = m.poll?.mine ?? [];
    const total = counts.reduce((a, b) => a + b, 0);
    content = (
      <div className="p-3 w-72 max-w-full">
        <p className="font-bold flex items-start gap-2"><BarChart3 className="w-4 h-4 mt-0.5 shrink-0" /> {m.metadata?.question ?? m.body}</p>
        <p className={cn('text-[11px] mt-0.5 mb-2', mine ? 'text-white/70' : 'text-zinc-500')}>{m.metadata?.multiple ? 'Select one or more' : 'Select one'}</p>
        <div className="space-y-1.5">
          {options.map((o, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0;
            const chosen = mineVotes.includes(i);
            return (
              <button key={i} onClick={() => { haptic('tap'); p.onVote(i); }} disabled={m.pending}
                className={cn('relative w-full text-left rounded-xl px-3 py-2 overflow-hidden border transition-colors', mine ? 'border-white/25 hover:bg-white/10' : 'border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.04]')}>
                <span className={cn('absolute inset-y-0 left-0 transition-[width] duration-500', mine ? 'bg-white/20' : 'bg-indigo-500/15')} style={{ width: `${pct}%` }} />
                <span className="relative flex items-center gap-2">
                  <span className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', chosen ? (mine ? 'bg-white border-white text-indigo-600' : 'bg-indigo-600 border-indigo-600 text-white') : mine ? 'border-white/60' : 'border-zinc-300 dark:border-white/30')}>
                    {chosen && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{o}</span>
                  <span className="text-xs font-semibold tabular-nums">{counts[i]}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className={cn('text-[11px] mt-2', mine ? 'text-white/70' : 'text-zinc-500')}>{m.poll?.voters ?? 0} {m.poll?.voters === 1 ? 'person' : 'people'} voted</p>
      </div>
    );
  } else if (m.type === 'LOCATION' && m.metadata?.lat != null && m.metadata?.lng != null) {
    const { lat, lng } = m.metadata as { lat: number; lng: number };
    const d = 0.004;
    content = (
      <div className="p-1 w-72 max-w-full">
        <iframe
          title="Shared location"
          loading="lazy"
          className="w-full h-40 rounded-xl border-0 pointer-events-none"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`}
        />
        <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-2">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold truncate">{m.metadata.label || 'Shared location'}</span>
            <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>Open in Maps</span>
          </span>
        </a>
      </div>
    );
  } else if (m.type === 'CONTACT' && m.metadata?.userId) {
    content = (
      <div className="p-3 w-64 max-w-full">
        <div className="flex items-center gap-3">
          <Avatar name={m.metadata.name ?? m.body} src={m.metadata.avatar} size={40} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{m.metadata.name ?? m.body}</p>
            <p className={cn('text-[11px] capitalize', mine ? 'text-white/70' : 'text-zinc-500')}>{(m.metadata.role ?? '').toLowerCase()} · UniVerse</p>
          </div>
        </div>
        {m.metadata.userId !== me && (
          <button onClick={() => p.onOpenContact(m.metadata!.userId!)} className={cn('mt-2.5 w-full py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5', mine ? 'bg-white/20 hover:bg-white/25' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/15')}>
            <MessageCircle className="w-3.5 h-3.5" /> Message
          </button>
        )}
      </div>
    );
  } else {
    const t = p.translation;
    const translated = t?.status === 'done' && !t.same && !!t.text;
    const showing = translated && !p.showOriginal;
    content = (
      <div className="px-3.5 py-2.5">
        <RichText text={showing ? (t as { text: string }).text : m.body} mine={mine} emoji={p.customEmoji} />
        {m.metadata?.link && <LinkCard link={m.metadata.link} mine={mine} />}
        {translated && (
          <button onClick={p.onToggleOriginal} className={cn('mt-1.5 flex items-center gap-1 text-[11px] font-medium', mine ? 'text-white/75 hover:text-white' : 'text-indigo-500 dark:text-indigo-300 hover:underline')}>
            <Languages className="w-3 h-3" />
            {p.showOriginal ? 'Show translation' : <>Translated from {languageName((t as { from: string }).from)} · Show original</>}
          </button>
        )}
        {t?.status === 'pending' && <p className={cn('mt-1.5 flex items-center gap-1 text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}><Loader2 className="w-3 h-3 animate-spin" /> Translating…</p>}
        {t?.status === 'error' && (
          <button onClick={p.onTranslate} className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-500 hover:underline"><Languages className="w-3 h-3" /> {t.message ?? 'Couldn’t translate'} · Try again</button>
        )}
      </div>
    );
  }

  const startPress = () => {
    if (!touch || !interactive) return;
    pressTimer.current = setTimeout(() => { haptic('tap'); setMenu(true); setPicker(true); }, 480);
  };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };
  const close = () => { setMenu(false); setPicker(false); setFullPicker(false); };

  return (
    <div className={cn('group relative flex gap-2 items-end', mine ? 'justify-end' : 'justify-start')}>
      {/* Swipe-right-to-reply hint */}
      {touch && interactive && (
        <motion.div style={{ opacity: replyHint }} className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center pointer-events-none">
          <CornerUpLeft className="w-4 h-4" />
        </motion.div>
      )}
      <motion.div
        drag={touch && interactive ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.5 }}
        dragDirectionLock
        style={{ x }}
        onDragEnd={(_, info) => { if (info.offset.x > 60) { haptic('tap'); p.onReply(); } }}
        className={cn('flex flex-col min-w-0 max-w-[min(82%,34rem)]', mine ? 'items-end' : 'items-start')}
      >
        {m.metadata?.ai
          ? <span className="text-[11px] font-semibold text-fuchsia-500 mb-1 ml-2 inline-flex items-center gap-1">✨ UniVerse AI{m.metadata.askedBy ? <span className="font-normal text-zinc-500"> · asked by {m.metadata.askedBy.split(' ')[0]}</span> : null}</span>
          : showSender && !mine && <span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-300 mb-1 ml-2">{m.sender.name}</span>}
        <div className={cn('flex items-center gap-1 min-w-0 max-w-full', mine && 'flex-row-reverse')}>
          <div
            className={bubble}
            onDoubleClick={() => { if (interactive) { haptic('tap'); p.onReact('❤️'); } }}
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(e) => { if (interactive && !touch) { e.preventDefault(); setMenu(true); setPicker(false); } }}
          >
            {m.forwarded && !deleted && (
              <p className={cn('px-3.5 pt-2 text-[11px] italic flex items-center gap-1', mine ? 'text-white/70' : 'text-zinc-500')}><CornerUpRight className="w-3 h-3" /> Forwarded</p>
            )}
            {m.replyTo && !deleted && (
              <div className={cn('mx-2 mt-2 px-3 py-1.5 rounded-lg border-l-4 text-xs', mine ? 'bg-white/10 border-white/60' : 'bg-zinc-100 dark:bg-white/[0.05] border-indigo-400')}>
                <p className="font-semibold">{m.replyTo.sender.id === me ? 'You' : m.replyTo.sender.name}</p>
                <p className="opacity-80 line-clamp-2">{plainText(m.replyTo.body) || (m.replyTo.type === 'TEXT' ? 'Message deleted' : 'Attachment')}</p>
              </div>
            )}
            {content}
            <div className={cn('flex justify-end px-3 pb-2', m.type === 'TEXT' && !deleted && '-mt-1')}>{meta}</div>
          </div>

          {interactive && (
            <div className={cn('relative transition-opacity', menu || picker ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100', touch && !menu && !picker && 'hidden')}>
              <button onClick={() => { setPicker((v) => !v); setMenu(false); }} aria-label="React" className="p-1.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                <SmilePlus className="w-4 h-4" />
              </button>
              <button onClick={() => { setMenu((v) => !v); setPicker(false); }} aria-label="Message options" className="p-1.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                <MoreVertical className="w-4 h-4" />
              </button>
              {picker && (
                <div className={cn('absolute z-20 bottom-full mb-1 flex gap-1 p-1.5 rounded-full bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-xl', mine ? 'right-0' : 'left-0')}>
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => { p.onReact(e); close(); }} className="w-8 h-8 rounded-full text-lg hover:bg-zinc-100 dark:hover:bg-white/10 hover:scale-125 transition-transform">{e}</button>
                  ))}
                  <button type="button" onClick={() => { setFullPicker(true); setPicker(false); setMenu(false); }} aria-label="More reactions" title="More reactions" className="w-8 h-8 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center"><SmilePlus className="w-4 h-4" /></button>
                </div>
              )}
              {fullPicker && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={close} aria-hidden />
                  <div className={cn('z-[61] fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] flex justify-center sm:absolute sm:inset-x-auto sm:bottom-full sm:mb-1', mine ? 'sm:right-0' : 'sm:left-0')}>
                    <EmojiPicker onPick={(e) => { p.onReact(e); close(); }} onClose={close} custom={p.customEmoji ? Object.entries(p.customEmoji).map(([name, url]) => ({ name, url })) : []} />
                  </div>
                </>
              )}
              {menu && (
                <div className={cn('absolute z-20 w-48 py-1 rounded-xl bg-white dark:bg-[#121830] border border-zinc-200 dark:border-white/10 shadow-xl text-sm', picker ? 'top-full mt-1' : 'bottom-full mb-1', mine ? 'right-0' : 'left-0')} onMouseLeave={() => !touch && setMenu(false)}>
                  <MenuItem icon={CornerUpLeft} label="Reply" onClick={() => { p.onReply(); close(); }} />
                  {p.onThread && <MenuItem icon={MessageCircle} label="Reply in thread" onClick={() => { p.onThread!(); close(); }} />}
                  {FORWARDABLE.has(m.type) && <MenuItem icon={CornerUpRight} label="Forward" onClick={() => { p.onForward(); close(); }} />}
                  <MenuItem icon={m.starred ? StarOff : Star} label={m.starred ? 'Unstar' : 'Star'} onClick={() => { p.onStar(); close(); }} />
                  {p.onPin && <MenuItem icon={m.pinnedAt ? PinOff : Pin} label={m.pinnedAt ? 'Unpin' : 'Pin'} onClick={() => { p.onPin!(); close(); }} />}
                  {m.type === 'TEXT' && p.onTranslate && (
                    p.translation?.status === 'done' && !p.translation.same
                      ? <MenuItem icon={Languages} label={p.showOriginal ? 'Show translation' : 'Show original'} onClick={() => { p.onToggleOriginal?.(); close(); }} />
                      : <MenuItem icon={Languages} label="Translate" onClick={() => { p.onTranslate!(); close(); }} />
                  )}
                  {m.type === 'TEXT' && <MenuItem icon={Copy} label="Copy" onClick={() => { navigator.clipboard.writeText(m.body); close(); }} />}
                  {canEdit && <MenuItem icon={Pencil} label="Edit" onClick={() => { p.onEdit(); close(); }} />}
                  {mine && <MenuItem icon={Info} label="Info" onClick={() => { p.onInfo(); close(); }} />}
                  <MenuItem icon={EyeOff} label="Delete for me" onClick={() => { p.onDeleteForMe(); close(); }} />
                  {canDeleteForAll && <MenuItem icon={Trash2} label="Delete for everyone" danger onClick={() => { p.onDelete(); close(); }} />}
                  {touch && <MenuItem icon={Ban} label="Cancel" onClick={close} />}
                </div>
              )}
            </div>
          )}
        </div>

        {m.thread && m.thread.count > 0 && p.onThread && (
          <button type="button" onClick={p.onThread} className={cn('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:underline', mine ? 'mr-2' : 'ml-2')}>
            <MessageCircle className="w-3.5 h-3.5" /> {m.thread.count} {m.thread.count === 1 ? 'reply' : 'replies'}
          </button>
        )}
        {reactionEntries.length > 0 && (
          <div className={cn('flex gap-1 -mt-1.5 z-10', mine ? 'mr-2' : 'ml-2')}>
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => p.onReact(emoji)}
                className={cn('px-1.5 py-0.5 rounded-full text-xs border shadow-sm', users.includes(me) ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-400/40' : 'bg-white dark:bg-[#121830] border-zinc-200 dark:border-white/10')}
              >
                <EmojiGlyph emoji={emoji} custom={p.customEmoji} /> {users.length > 1 && <span className="text-zinc-600 dark:text-zinc-300">{users.length}</span>}
              </button>
            ))}
          </div>
        )}
      </motion.div>
      {history && <EditHistory id={m.id} onClose={() => setHistory(false)} emoji={p.customEmoji} />}
    </div>
  );
}

/** An edited message's earlier versions (Stage 4 · 1.3), newest first. */
function EditHistory({ id, onClose, emoji }: { id: string; onClose: () => void; emoji?: Record<string, string> }) {
  const { data } = useSWR<{ versions: { body: string; at: string; current: boolean }[] }>(`/api/chat/messages/${id}/edits`, (url: string) => authedJson(url));
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div role="dialog" aria-label="Edit history" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        className="w-full sm:max-w-md max-h-[70vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#121830] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Pencil className="w-4 h-4 text-indigo-500" />Edit history</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        {!data ? <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 rounded-2xl skeleton" />)}</div>
          : data.versions.length === 0 ? <p className="text-sm text-zinc-500">No earlier versions to show.</p>
          : data.versions.map((v, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{v.current ? 'Now' : i === data.versions.length - 1 ? 'First sent' : 'Earlier'} · <span className="normal-case font-normal">{when(v.at)}</span></p>
              <div className={cn('rounded-2xl px-3.5 py-2.5 text-[15px] text-zinc-900 dark:text-white', v.current ? 'bg-indigo-500/10 ring-1 ring-indigo-400/30' : 'bg-zinc-100 dark:bg-white/[0.06]')}>
                <RichText text={v.body} mine={false} emoji={emoji} />
              </div>
            </div>
          ))}
      </motion.div>
    </div>,
    document.body,
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]', danger ? 'text-rose-500' : 'text-zinc-700 dark:text-zinc-200')}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

/** A photo in a chat. In low-data mode, photos from others load only when tapped. */
function ChatPhoto({ url, name, size, mine, onOpen }: { url: string; name?: string | null; size?: number | null; mine: boolean; onOpen: () => void }) {
  const lowData = useLowData((s) => s.enabled);
  const [show, setShow] = useState(false);
  if (lowData && !mine && !show) {
    return (
      <button onClick={() => setShow(true)} className="m-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-black/5 dark:bg-white/[0.06] text-left">
        <ImageIcon className="w-5 h-5 opacity-70" />
        <span className="text-sm"><span className="block font-medium">Photo{size ? ` · ${formatBytes(size)}` : ''}</span><span className="block text-[11px] opacity-70">Low-data mode · tap to load</span></span>
      </button>
    );
  }
  return (
    <button onClick={onOpen} className="block p-1">
      <img src={url} alt={name || 'Photo'} loading="lazy" className="rounded-xl max-h-80 w-auto object-cover" />
    </button>
  );
}

/** A video in a chat: nothing is downloaded until play in low-data mode. */
export function ChatVideo({ url }: { url: string }) {
  const lowData = useLowData((s) => s.enabled);
  return <video src={url} controls preload={lowData ? 'none' : 'metadata'} className="rounded-xl max-h-80 m-1" />;
}

/** A view-once photo, video or voice message: opened once, full screen, then gone for you. */
function ViewOnce({ m, mine }: { m: ChatMessage; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const label = m.type === 'IMAGE' ? 'Photo' : m.type === 'VIDEO' ? 'Video' : 'Voice message';
  const meta = m.metadata ?? {};
  const gone = used || meta.opened || !m.attachmentUrl;
  const show = () => {
    if (mine || gone) return;
    haptic('tap');
    setOpen(true);
    void authedJson(`/api/chat/messages/${m.id}/opened`, { method: 'POST' }).catch(() => {});
  };
  return (
    <>
      <button type="button" onClick={show} disabled={mine || gone} className="flex items-center gap-2.5 px-3.5 py-3 text-left w-60 max-w-full">
        <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 border-dashed', mine ? 'border-white/60' : gone ? 'border-zinc-300 dark:border-zinc-600 text-zinc-400' : 'border-indigo-500 text-indigo-500')}><Flame className="w-4 h-4" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>
            {mine ? (meta.openedCount ? `Opened${meta.openedCount > 1 ? ` by ${meta.openedCount}` : ''}` : 'View once · not opened yet') : gone ? 'Opened' : 'View once · tap to open'}
          </span>
        </span>
      </button>
      {open && m.attachmentUrl && (
        <div className="fixed inset-0 z-[160] bg-black/95 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`View once ${label.toLowerCase()}`} onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setUsed(true); } }}>
          <p className="text-white/70 text-xs mb-3 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> View once: it disappears when you close it</p>
          {m.type === 'IMAGE' && <img src={m.attachmentUrl} alt="" className="max-w-full max-h-[80vh] object-contain rounded-xl" onContextMenu={(e) => e.preventDefault()} draggable={false} />}
          {m.type === 'VIDEO' && <video src={m.attachmentUrl} autoPlay controls controlsList="nodownload" className="max-w-full max-h-[80vh] rounded-xl" />}
          {m.type === 'AUDIO' && <div className="bg-white/10 rounded-2xl pb-2"><VoicePlayer src={m.attachmentUrl} mine durationSec={meta.durationSec} /></div>}
          <button type="button" onClick={() => { setOpen(false); setUsed(true); }} className="mt-5 px-5 py-2 rounded-full bg-white/15 text-white text-sm font-semibold">Close</button>
        </div>
      )}
    </>
  );
}

/** The text of a voice message: made by AI on request (once), then saved for everyone in the chat. */
function VoiceTranscript({ id, transcript, mine, pending }: { id: string; transcript?: string; mine: boolean; pending: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = text ?? transcript;
  const ask = async () => {
    if (shown) return setOpen((o) => !o);
    setBusy(true);
    try {
      const r = await authedJson<{ transcript: string }>(`/api/chat/messages/${id}/transcribe`, { method: 'POST' });
      setText(r.transcript);
      setOpen(true);
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (pending) return null;
  return (
    <div className="px-3 pt-1">
      <button type="button" onClick={() => void ask()} className={cn('text-[11px] font-semibold inline-flex items-center gap-1', mine ? 'text-white/80 hover:text-white' : 'text-indigo-500 hover:underline')}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} {shown ? (open ? 'Hide transcript' : 'Show transcript') : 'Transcript'}
      </button>
      {open && shown && <p className={cn('text-[13px] mt-1 leading-snug whitespace-pre-wrap', mine ? 'text-white/90' : 'text-zinc-700 dark:text-zinc-300')}>{shown}</p>}
    </div>
  );
}

/** A link's title and description (read by the server when the message was sent). */
function LinkCard({ link, mine }: { link: NonNullable<NonNullable<ChatMessage['metadata']>['link']>; mine: boolean }) {
  return (
    <a href={safeHref(link.url)} target="_blank" rel="noopener noreferrer nofollow" className={cn('mt-2 block rounded-xl border-l-4 px-3 py-2 transition-colors', mine ? 'bg-white/10 border-white/60 hover:bg-white/15' : 'bg-zinc-100 dark:bg-white/[0.05] border-indigo-400 hover:bg-zinc-200/70 dark:hover:bg-white/[0.08]')}>
      <span className={cn('flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide', mine ? 'text-white/70' : 'text-zinc-500')}><ExternalLink className="w-3 h-3" />{link.site}</span>
      <span className="block text-sm font-semibold leading-snug line-clamp-2 mt-0.5">{link.title}</span>
      {link.description && <span className={cn('block text-xs leading-snug line-clamp-2 mt-0.5', mine ? 'text-white/80' : 'text-zinc-600 dark:text-zinc-400')}>{link.description}</span>}
    </a>
  );
}
