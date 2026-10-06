'use client';

import { useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Crown, Hand, Mic, MicOff, MoreHorizontal, Pin, PinOff, Shield, ShieldOff, UserMinus, Video, VideoOff, X } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// People in a call, and the host's controls (cloudflare/worker.ts CallRoom.control): mute, ask to
// unmute, stop video, spotlight for everyone, co-hosts, remove, lower hands. A side panel on
// computers, a sheet on phones. Asking someone to unmute never unmutes them: they choose.
// Raised hands queue at the top in the order they went up; speaking time is measured on this
// device from what it hears (src/components/call/CallView.tsx useSpeaking).

export interface Person {
  id: string; name: string; me?: boolean; host?: boolean; cohost?: boolean;
  muted: boolean; camera: boolean; sharing?: boolean;
  /** When their hand went up (null: down). */ hand?: number | null;
  /** How long they've spoken in this call (ms). */ talkMs?: number;
}

export type ControlAction = 'mute' | 'ask-unmute' | 'stop-video' | 'mute-all' | 'spotlight' | 'cohost' | 'remove' | 'lower-hand' | 'lower-all';

const talkClock = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

const initials = (name: string) => name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';

const chip = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors';

export function PeoplePanel({ open, onClose, people, canModerate, isHost, spotlight, onControl, onLowerMyHand }: {
  open: boolean; onClose: () => void; people: Person[]; onLowerMyHand: () => void;
  /** The host or a co-host. */ canModerate: boolean;
  /** The call's own host (only they make co-hosts). */ isHost: boolean;
  spotlight: string | null;
  onControl: (action: ControlAction, target?: string | null, on?: boolean) => void;
}) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const lit = people.find((p) => p.id === spotlight);
  const act = (action: ControlAction, target?: string | null, on?: boolean) => { haptic('tap'); onControl(action, target, on); setOpenRow(null); setConfirmRemove(null); };
  const hands = people.filter((p) => p.hand).sort((a, b) => a.hand! - b.hand!);
  const loudest = Math.max(1, ...people.map((p) => p.talkMs ?? 0));
  const talked = people.some((p) => (p.talkMs ?? 0) >= 1000);
  // You first, then raised hands (in order), then whoever runs the call, then everyone by name.
  const sorted = [...people].sort((a, b) => Number(!!b.me) - Number(!!a.me) || (a.hand ?? Infinity) - (b.hand ?? Infinity) || Number(!!(b.host || b.cohost)) - Number(!!(a.host || a.cohost)) || a.name.localeCompare(b.name));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="people" role="dialog" aria-label="People in the call"
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth}
            className="absolute z-40 inset-x-0 bottom-0 max-h-[78vh] rounded-t-3xl sm:inset-x-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:w-[22rem] sm:max-h-none sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="font-semibold">People <span className="text-zinc-400 font-normal">· {people.length}</span></p>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <AnimatePresence initial={false}>
              {hands.length > 0 && (
                <motion.section key="hands" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                  <div className="mx-3 mb-3 rounded-2xl bg-amber-400/10 border border-amber-300/20 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-200 inline-flex items-center gap-1.5"><Hand className="w-3.5 h-3.5" />Raised hands · {hands.length}</p>
                      {canModerate && hands.length > 1 && <button type="button" onClick={() => act('lower-all')} className="text-xs font-semibold text-amber-200 hover:underline">Lower all</button>}
                    </div>
                    <ol className="space-y-1">
                      {hands.map((p, i) => (
                        <motion.li key={p.id} layout="position" transition={spring.smooth} className="flex items-center gap-2 text-sm">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="flex-1 truncate">{p.name}{p.me ? ' (you)' : ''}</span>
                          {(p.me || canModerate) && <button type="button" onClick={() => (p.me ? onLowerMyHand() : act('lower-hand', p.id))} className="text-xs text-zinc-300 hover:text-white hover:underline">Lower</button>}
                        </motion.li>
                      ))}
                    </ol>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
            {(canModerate || lit) && (
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {canModerate && people.some((p) => !p.me && !p.muted && !p.host && !p.cohost) && (
                  <button type="button" onClick={() => act('mute-all')} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><MicOff className="w-3.5 h-3.5" />Mute everyone</button>
                )}
                {lit && (
                  <span className={cn(chip, 'bg-gradient-to-r from-indigo-500/30 to-fuchsia-500/30 text-white')}>
                    <Pin className="w-3.5 h-3.5" />{lit.me ? 'You’re' : `${lit.name} is`} in the spotlight
                    {canModerate && <button type="button" onClick={() => act('spotlight', null)} className="ml-1 underline underline-offset-2">Stop</button>}
                  </span>
                )}
              </div>
            )}
            <ul className="flex-1 overflow-y-auto pb-2">
              {sorted.map((p) => {
                const others = !p.me;
                const removable = others && !p.host && (!p.cohost || isHost);
                const menu = canModerate;
                return (
                  <motion.li key={p.id} layout="position" transition={spring.smooth}>
                    <div className="flex items-center gap-3 px-4 py-2">
                      <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold">{initials(p.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">{p.hand ? <Hand className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-label="Hand raised" /> : null}<span className="truncate">{p.name}{p.me ? ' (you)' : ''}</span></p>
                        {(p.host || p.cohost || p.sharing || spotlight === p.id) && (
                          <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                            {p.host && <span className="inline-flex items-center gap-1 text-amber-300"><Crown className="w-3 h-3" />Host</span>}
                            {p.cohost && <span className="inline-flex items-center gap-1 text-sky-300"><Shield className="w-3 h-3" />Co-host</span>}
                            {spotlight === p.id && <span className="inline-flex items-center gap-1 text-fuchsia-300"><Pin className="w-3 h-3" />Spotlight</span>}
                            {p.sharing && <span>Presenting</span>}
                          </p>
                        )}
                        {talked && (
                          <div className="mt-1 flex items-center gap-2" title="Speaking time in this call">
                            <span className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                              <motion.span className="block h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" initial={false} animate={{ width: `${((p.talkMs ?? 0) / loudest) * 100}%` }} transition={spring.smooth} />
                            </span>
                            <span className="text-[10px] text-zinc-500 tabular-nums w-12 text-right">{talkClock(p.talkMs ?? 0)}</span>
                          </div>
                        )}
                      </div>
                      {p.muted ? <MicOff className="w-4 h-4 text-rose-300 shrink-0" aria-label="Muted" /> : <Mic className="w-4 h-4 text-zinc-400 shrink-0" aria-label="Microphone on" />}
                      {p.camera ? <Video className="w-4 h-4 text-zinc-400 shrink-0" aria-label="Camera on" /> : <VideoOff className="w-4 h-4 text-zinc-600 shrink-0" aria-label="Camera off" />}
                      {menu && (
                        <button type="button" onClick={() => { setOpenRow(openRow === p.id ? null : p.id); setConfirmRemove(null); }} aria-expanded={openRow === p.id} aria-label={`Actions for ${p.name}`}
                          className={cn('p-1.5 rounded-full shrink-0 transition-colors', openRow === p.id ? 'bg-white/15' : 'hover:bg-white/10')}><MoreHorizontal className="w-4 h-4" /></button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {menu && openRow === p.id && (
                        <motion.div key="actions" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} className="overflow-hidden">
                          <div className="px-4 pb-3 pl-16 flex flex-wrap gap-1.5">
                            {others && (p.muted
                              ? <button type="button" onClick={() => act('ask-unmute', p.id)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><Mic className="w-3.5 h-3.5" />Ask to unmute</button>
                              : <button type="button" onClick={() => act('mute', p.id)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><MicOff className="w-3.5 h-3.5" />Mute</button>)}
                            {others && p.camera && <button type="button" onClick={() => act('stop-video', p.id)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><VideoOff className="w-3.5 h-3.5" />Stop video</button>}
                            {spotlight === p.id
                              ? <button type="button" onClick={() => act('spotlight', null)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><PinOff className="w-3.5 h-3.5" />Remove spotlight</button>
                              : <button type="button" onClick={() => act('spotlight', p.id)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><Pin className="w-3.5 h-3.5" />Spotlight for everyone</button>}
                            {isHost && others && !p.host && (p.cohost
                              ? <button type="button" onClick={() => act('cohost', p.id, false)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><ShieldOff className="w-3.5 h-3.5" />Remove co-host</button>
                              : <button type="button" onClick={() => act('cohost', p.id, true)} className={cn(chip, 'bg-white/10 hover:bg-white/20')}><Shield className="w-3.5 h-3.5" />Make co-host</button>)}
                            {removable && (confirmRemove === p.id
                              ? <button type="button" onClick={() => act('remove', p.id)} className={cn(chip, 'bg-rose-600 hover:bg-rose-500')}><UserMinus className="w-3.5 h-3.5" />Remove {p.name.split(' ')[0]} for this call</button>
                              : <button type="button" onClick={() => setConfirmRemove(p.id)} className={cn(chip, 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25')}><UserMinus className="w-3.5 h-3.5" />Remove</button>)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
