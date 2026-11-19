'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarPlus, Captions, Check, ChevronRight, DoorOpen, Copy, Hand, Headphones, Keyboard, LayoutGrid, Link2, Loader2, LogIn, MessageSquareText, Mic, MonitorUp, PenTool, Phone, Radio, Share2, Shield, Smile, Sparkles, Users, Video, Vote } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { authedJson } from '@/lib/authed-fetch';
import { haptic } from '@/lib/haptics';
import { inviteText, meetingPath } from '@/lib/meet';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { QrCode } from '@/components/ui/QrCode';

// M227 (the owner, 16 Nov: "replace the call and rename it as meet and call… redesign of call section also and add more
// features of discord and zoom and all the other big major app"): the front door of Meet & call, like Zoom's home.
// New meeting (a link to share, with its code and an invitation to copy), Join (a code or a link), Schedule (the
// form ScheduledCalls already has, ?schedule=1), Voice rooms (Discord's: every group chat is a room to drop into,
// lit while someone's in it); what's happening now, one tap to join; and what every meeting has. No new server work:
// the call links, the calls list and the chats list are the ones the page already loads.

interface LiveRow { callId: string; type: string; title: string; live: boolean; kind: 'audio' | 'video' | null; people: string[]; more: number }
interface Convo { id: string; isGroup: boolean; private?: boolean; title: string; memberCount: number; archived?: boolean }

const TILE = 'group relative flex flex-col items-start justify-between gap-6 rounded-[22px] p-4 sm:p-5 min-h-[124px] text-start text-white shadow-[0_14px_34px_-18px_rgb(0_0_0/0.5)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2';
const ICON = 'grid place-items-center w-11 h-11 rounded-2xl bg-white/20 shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4)]';

/** What every meeting already has (CallView): shown so people know where to find it. */
const IN_CALL: [typeof Video, string][] = [
  [Shield, 'Waiting room'], [Users, 'Breakout rooms'], [Vote, 'Polls'], [PenTool, 'Whiteboard'], [Captions, 'Live captions'],
  [Radio, 'Recording and notes'], [Hand, 'Raise hand'], [Smile, 'Reactions'], [MonitorUp, 'Share your screen'],
  [Sparkles, 'Background blur'], [MessageSquareText, 'Q&A and chat'], [LayoutGrid, 'Grid or speaker view'], [Keyboard, 'Keyboard shortcuts'], [Mic, 'Hold Space to talk'],
];

export function MeetHome() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user?.name);
  const [sheet, setSheet] = useState<'new' | 'room' | 'join' | 'rooms' | null>(null);
  // The same lists the page and the Messages deck load (one request each, shared).
  const { data: calls } = useSWR<LiveRow[]>('/api/calls', authedJson, { revalidateOnFocus: false, dedupingInterval: 15_000 });
  const live = (Array.isArray(calls) ? calls : []).filter((c) => c.live);
  const open = (s: typeof sheet) => { haptic('tap'); setSheet(s); };

  return (
    <section aria-label="Meet and call" className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => open('new')} className={cn(TILE, 'bg-gradient-to-br from-[#ff8a3d] to-[#f25c05] focus-visible:outline-[#f25c05]')}>
          <span className={ICON}><Video className="w-5 h-5" aria-hidden /></span>
          <span><span className="block text-[15px] font-bold">New meeting</span><span className="block text-xs text-white/85">A link anyone on UniVerse can join</span></span>
        </button>
        <button type="button" onClick={() => open('join')} className={cn(TILE, 'bg-gradient-to-br from-[#4aa3ff] to-[#1a6ff0] focus-visible:outline-[#1a6ff0]')}>
          <span className={ICON}><LogIn className="w-5 h-5" aria-hidden /></span>
          <span><span className="block text-[15px] font-bold">Join</span><span className="block text-xs text-white/85">With a code or a link</span></span>
        </button>
        <button type="button" onClick={() => { haptic('tap'); router.replace('/calls?schedule=1', { scroll: false }); }} className={cn(TILE, 'bg-gradient-to-br from-[#8f7bff] to-[#5b3fe6] focus-visible:outline-[#5b3fe6]')}>
          <span className={ICON}><CalendarPlus className="w-5 h-5" aria-hidden /></span>
          <span><span className="block text-[15px] font-bold">Schedule</span><span className="block text-xs text-white/85">For a class, a group or anyone</span></span>
        </button>
        <button type="button" onClick={() => open('rooms')} className={cn(TILE, 'bg-gradient-to-br from-[#34c77b] to-[#0f9d58] focus-visible:outline-[#0f9d58]')}>
          <span className={ICON}><Headphones className="w-5 h-5" aria-hidden /></span>
          <span><span className="block text-[15px] font-bold">Voice rooms</span><span className="block text-xs text-white/85">Drop in, like a channel</span></span>
        </button>
      </div>
      {/* M342: my personal room (Zoom's personal meeting room): one link that's always mine. */}
      <button type="button" onClick={() => open('room')} className="w-full flex items-center gap-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)] px-4 py-3 text-start hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shrink-0"><DoorOpen className="w-5 h-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-zinc-900 dark:text-white">My room</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">Your own link, the same every time: share it once</span></span>
        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 rtl:rotate-180" aria-hidden />
      </button>

      {live.length > 0 && (
        <div className="panel p-4" aria-label="Happening now" role="region">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white"><span className="relative flex w-2.5 h-2.5"><span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" /><span className="relative w-2.5 h-2.5 rounded-full bg-emerald-500" /></span>Happening now</p>
          <ul className="divide-y divide-[var(--hairline)]">
            {live.map((c) => (
              <li key={c.callId} className="flex items-center gap-3 py-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 shrink-0">{c.kind === 'audio' || c.type === 'room' ? <Headphones className="w-4 h-4" aria-hidden /> : <Video className="w-4 h-4" aria-hidden />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{c.title}</span>{c.people.length > 0 && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400" translate="no">{c.people.join(', ')}{c.more ? ` and ${c.more} more` : ''}</span>}</span>
                <button type="button" onClick={() => router.push(c.type === 'hall' ? `/hall/${c.callId}` : `/call/${c.callId}`)} className="shrink-0 h-9 px-4 rounded-full bg-emerald-700 text-white text-sm font-semibold active:scale-95 transition-transform">Join</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="panel p-4 group/feat">
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-zinc-900 dark:text-white">In every meeting<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-open/feat:hidden">Show</span></summary>
        <ul className="mt-3 flex flex-wrap gap-2">
          {IN_CALL.map(([Icon, label]) => <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200"><Icon className="w-3.5 h-3.5" aria-hidden />{label}</li>)}
        </ul>
      </details>

      {sheet === 'new' && <NewMeeting who={me} onClose={() => setSheet(null)} />}
      {sheet === 'room' && <NewMeeting who={me} personal onClose={() => setSheet(null)} />}
      {sheet === 'join' && <JoinMeeting onClose={() => setSheet(null)} />}
      {sheet === 'rooms' && <VoiceRooms live={new Set(live.filter((c) => c.callId.startsWith('r_')).map((c) => c.callId.slice(2)))} onClose={() => setSheet(null)} />}
    </section>
  );
}

/** A new meeting: its link is made at once (POST /api/calls/links, the call link M17 added), then start it, copy the
 *  invitation or share it. */
function NewMeeting({ who, personal = false, onClose }: { who?: string; personal?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const { data, error } = useSWR<{ path: string }>(personal ? 'meet-my-room' : 'meet-new-link', () => authedJson<{ path: string }>('/api/calls/links', { method: 'POST', body: JSON.stringify({ personal }) }), { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false });
  const url = data ? `${window.location.origin}${data.path}` : '';
  const code = data ? data.path.split('/').pop() ?? '' : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteText(url, code, who)); setCopied(true); haptic('success'); toast.success('Invitation copied'); } catch { toast.error('Couldn’t copy: select the link instead'); }
  };
  return (
    <Sheet title={personal ? 'My room' : 'New meeting'} onClose={onClose}>
      {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p> : !data ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Making your meeting link…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] p-4">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Meeting link</p>
            <p className="mt-0.5 break-all font-mono text-sm text-zinc-900 dark:text-white select-all">{url}</p>
            <p className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Meeting code</p>
            <p className="mt-0.5 font-mono text-lg font-bold tracking-wide text-zinc-900 dark:text-white select-all">{code}</p>
            {/* M344: scan to join from a phone. */}
            <QrCode value={url} size={144} title="QR code of the meeting link" className="mt-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => router.push(`${data.path}?kind=video`)} className="btn-primary justify-center"><Video className="w-4 h-4" aria-hidden />Start with video</button>
            <button type="button" onClick={() => router.push(`${data.path}?kind=audio`)} className="btn-secondary justify-center"><Phone className="w-4 h-4" aria-hidden />Start with voice</button>
            <button type="button" onClick={() => void copy()} className="btn-secondary justify-center">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? 'Copied' : 'Copy invitation'}</button>
            {typeof navigator !== 'undefined' && 'share' in navigator
              ? <button type="button" onClick={() => void navigator.share({ title: 'A meeting on UniVerse', text: inviteText(url, code, who) }).catch(() => {})} className="btn-secondary justify-center"><Share2 className="w-4 h-4" aria-hidden />Share</button>
              : <button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))} className="btn-secondary justify-center"><Link2 className="w-4 h-4" aria-hidden />Copy link</button>}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">{personal ? 'Your room’s link never changes: put it in your email signature or profile. People can join while you’re in it; turn on the waiting room to let them in one by one.' : 'You host it: people with the link wait in the waiting room until you let them in, if you turn it on.'}</p>
        </div>
      )}
    </Sheet>
  );
}

/** Join with a code or a pasted link: only our own call pages come out of it (meetingPath). */
function JoinMeeting({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'video' | 'audio'>('video');
  const path = meetingPath(text);
  return (
    <Sheet title="Join a meeting" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (path) router.push(`${path}?kind=${kind}`); }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">Meeting code or link</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="l_ab12cd or https://…/call/…" autoComplete="off" spellCheck={false}
            className="mt-1.5 w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-white outline-none focus:border-tint" />
          {text && !path && <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">That isn’t a meeting code or a UniVerse link.</span>}
        </label>
        <div role="group" aria-label="Join with" className="flex gap-2">
          {(['video', 'audio'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn('flex-1 h-10 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 border transition-colors', kind === k ? 'border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'border-[var(--hairline)] bg-[var(--surface)] text-zinc-900 dark:text-white')}>
              {k === 'video' ? <Video className="w-4 h-4" aria-hidden /> : <Phone className="w-4 h-4" aria-hidden />}{k === 'video' ? 'Camera on' : 'Voice only'}
            </button>
          ))}
        </div>
        <button type="submit" disabled={!path} className="btn-primary w-full justify-center disabled:opacity-50"><LogIn className="w-4 h-4" aria-hidden />Join</button>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">You’ll see yourself and choose your camera and microphone before you go in.</p>
      </form>
    </Sheet>
  );
}

/** Discord's voice channels: every group chat is a room to drop into (r_<chat>, the voice rooms of Stage 4 · 1.11),
 *  lit while someone is in it. */
function VoiceRooms({ live, onClose }: { live: Set<string>; onClose: () => void }) {
  const router = useRouter();
  const { data } = useSWR<{ conversations: Convo[] }>('/api/chat/conversations', authedJson, { revalidateOnFocus: false, dedupingInterval: 15_000 });
  const rooms = (data?.conversations ?? []).filter((c) => c.isGroup && !c.private && !c.archived).sort((a, b) => Number(live.has(b.id)) - Number(live.has(a.id)));
  return (
    <Sheet title="Voice rooms" onClose={onClose}>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">Each of your groups has a room that’s always open. Drop in to talk; leave when you like.</p>
      {!data ? <p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading your groups…</p>
        : rooms.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-400">No groups yet. Start a group in Chats, and its voice room is here.</p> : (
          <ul className="space-y-2">
            {rooms.map((c) => {
              const on = live.has(c.id);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => router.push(`/call/r_${c.id}?kind=audio`)} className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors">
                    <span className={cn('grid place-items-center w-9 h-9 rounded-xl shrink-0', on ? 'bg-emerald-500 text-white' : 'bg-black/[0.06] dark:bg-white/[0.1] text-zinc-600 dark:text-zinc-300')}><Headphones className="w-4 h-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{c.title}</span><span className="block text-xs text-zinc-500 dark:text-zinc-400">{on ? 'Live now' : `${c.memberCount} members`}</span></span>
                    <span className={cn('shrink-0 text-xs font-semibold', on ? 'text-emerald-700 dark:text-emerald-300' : 'text-tint-text')}>{on ? 'Join' : 'Drop in'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </Sheet>
  );
}
