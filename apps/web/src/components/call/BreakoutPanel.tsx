'use client';

import { useMemo, useState } from 'react';
import { useTick } from '@/lib/use-now';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ArrowLeft, Clock, DoorOpen, LifeBuoy, Megaphone, Minus, Plus, Send, Shuffle, Users, X } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Breakout rooms (Stage 4 · 2.6): the host splits the call into smaller rooms (shuffled, by hand, or
// people pick), with a timer, a message for every room, visits to any room and "everyone back".
// The main call's room keeps the plan (cloudflare/worker.ts CallRoom.boControl); each room is a call
// room of its own (`<call>~b<n>`), and CallView moves people between them, camera and mic carrying on.
//  • BreakoutPanel: the host's panel (side panel on computers, sheet on phones).
//  • BreakoutBar: the strip at the top while rooms are open (time left, ask for help, back).
//  • RoomPicker: picking your own room, when the host lets people choose.

/** The plan as the call room tells me: my room; hosts also get who goes where and who's in each room. */
export interface BreakoutView {
  id: string;
  endsAt: number | null;
  closing: number | null;
  choose: boolean;
  note: { text: string; by: string; at: number } | null;
  mine: number | null;
  rooms: { n: number; name: string; count: number; here?: string[] }[];
  people?: { k: string; name: string; n: number }[];
}

export type BreakoutMsg =
  | { action: 'bo-open'; rooms: number; assign: Record<string, number>; minutes: number; choose: boolean }
  | { action: 'bo-assign'; k?: string; target?: string; n: number }
  | { action: 'bo-note'; text: string }
  | { action: 'bo-time'; minutes: number }
  | { action: 'bo-close' }
  | { action: 'bo-end' };

/** Breakout room n of a call. */
export const roomId = (callId: string, n: number) => `${callId}~b${n}`;

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** About three people a room, at least two rooms. */
const suggest = (people: number) => Math.min(20, Math.max(2, Math.round(people / 3)));

/** Shuffles people into rooms evenly (the same seed, the same rooms, so the preview holds still). */
function shuffleInto(ids: string[], rooms: number, seed: number): Record<string, number> {
  let a = Math.floor(seed * 2 ** 31) || 1;
  const rand = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return Object.fromEntries(order.map((id, i) => [id, (i % rooms) + 1]));
}

const TIMERS = [0, 5, 10, 15, 20, 30];
const initials = (name: string) => name.split(/\s+/).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
const panel = 'absolute z-40 inset-x-0 bottom-0 max-h-[82vh] rounded-t-3xl sm:inset-x-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.75rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] sm:w-[24rem] sm:max-h-none sm:rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0';
const pill = 'relative isolate px-3 py-1.5 rounded-full text-xs font-semibold transition-colors';

export function BreakoutPanel({ open, onClose, bo, people, room, onSend, onJoin }: {
  open: boolean; onClose: () => void;
  bo: BreakoutView | null;
  /** Everyone else in the room I'm in, for putting into rooms (hosts and co-hosts stay in the main call by default). */
  people: { id: string; name: string; host?: boolean }[];
  /** The breakout room I'm in (null: the main call). */
  room: number | null;
  onSend: (msg: BreakoutMsg) => void;
  /** Go to a room (null: back to the main call). */
  onJoin: (n: number | null) => void;
}) {
  const send = (msg: BreakoutMsg) => { haptic('tap'); onSend(msg); };
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bo-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40 sm:hidden" aria-hidden />
          <motion.aside key="bo" role="dialog" aria-label="Breakout rooms" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 28 }} transition={spring.smooth} className={panel}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="font-semibold inline-flex items-center gap-2"><DoorOpen className="w-4 h-4 text-fuchsia-300" />Breakout rooms</p>
              <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              {bo ? (
                <motion.div key={`live-${bo.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.smooth} className="flex-1 min-h-0 flex flex-col">
                  <Running bo={bo} people={people} room={room} send={send} onJoin={(n) => { haptic('tap'); onJoin(n); }} />
                </motion.div>
              ) : (
                <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.smooth} className="flex-1 min-h-0 flex flex-col">
                  <Setup people={people} onOpen={(msg) => send(msg)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Before the rooms open: how many, who goes where, and for how long. */
function Setup({ people, onOpen }: { people: { id: string; name: string; host?: boolean }[]; onOpen: (msg: BreakoutMsg) => void }) {
  const movable = people.filter((p) => !p.host);
  const ids = movable.map((p) => p.id).join('|');
  const [count, setCount] = useState(() => suggest(movable.length));
  const [mode, setMode] = useState<'auto' | 'manual' | 'choose'>('auto');
  const [minutes, setMinutes] = useState(10);
  const [seed, setSeed] = useState(0.5);
  const [manual, setManual] = useState<Record<string, number>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ids stands for movable
  const auto = useMemo(() => shuffleInto(movable.map((p) => p.id), count, seed), [ids, count, seed]);
  const plan = mode === 'auto' ? auto : mode === 'manual' ? manual : {};
  const placed = Object.values(plan).filter((n) => n > 0 && n <= count).length;
  const pickMode = (m: typeof mode) => {
    haptic('tap');
    if (m === 'manual' && !Object.keys(manual).length) setManual(auto);
    setMode(m);
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-4">
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Rooms</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { haptic('tap'); setCount((c) => Math.max(1, c - 1)); }} disabled={count <= 1} aria-label="One room fewer" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <span className="text-2xl font-bold tabular-nums w-8 text-center" aria-live="polite">{count}</span>
            <button type="button" onClick={() => { haptic('tap'); setCount((c) => Math.min(20, c + 1)); }} disabled={count >= 20} aria-label="One room more" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            <span className="text-xs text-zinc-400">{movable.length ? `about ${Math.max(1, Math.round(movable.length / count))} each` : 'Nobody else is here yet'}</span>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Who goes where</p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-white/[0.06]" role="group" aria-label="Who goes where">
            {([['auto', 'Shuffle'], ['manual', 'I choose'], ['choose', 'They choose']] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => pickMode(m)} aria-pressed={mode === m} className={cn('relative isolate py-2 rounded-xl text-sm font-semibold transition-colors', mode === m ? 'text-white' : 'text-zinc-400 hover:text-white')}>
                {mode === m && <motion.span layoutId="bo-mode" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-400">
            {mode === 'auto' ? 'Everyone is shuffled into rooms evenly. Hosts stay in the main call.' : mode === 'manual' ? 'Pick a room for each person.' : 'Everyone picks a room from a list, and can switch rooms.'}
          </p>
        </section>

        {mode !== 'choose' && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{placed} of {movable.length} placed</p>
              {mode === 'auto' && movable.length > 1 && <button type="button" onClick={() => { haptic('tap'); setSeed(Math.random()); }} className="text-xs font-semibold text-indigo-200 hover:underline inline-flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" />Shuffle again</button>}
            </div>
            {mode === 'auto' ? (
              <ul className="space-y-1.5">
                {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                  const inRoom = movable.filter((p) => auto[p.id] === n);
                  return (
                    <li key={n} className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                      <p className="text-xs font-semibold text-zinc-300">Room {n} <span className="text-zinc-500 font-normal">· {inRoom.length}</span></p>
                      <p className="text-sm text-zinc-200 truncate">{inRoom.map((p) => p.name).join(', ') || <span className="text-zinc-500">Empty</span>}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-1">
                {movable.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold">{initials(p.name)}</span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <select aria-label={`Room for ${p.name}`} value={manual[p.id] ?? 0} onChange={(e) => setManual((m) => ({ ...m, [p.id]: Number(e.target.value) }))} className="h-8 rounded-full bg-white/10 px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50">
                      <option value={0}>Main call</option>
                      {Array.from({ length: count }, (_, i) => <option key={i} value={i + 1}>Room {i + 1}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Close rooms after</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Close rooms after">
            {TIMERS.map((m) => (
              <button key={m} type="button" onClick={() => { haptic('tap'); setMinutes(m); }} aria-pressed={minutes === m} className={cn(pill, minutes === m ? 'text-white' : 'text-zinc-300 bg-white/[0.06] hover:bg-white/15')}>
                {minutes === m && <motion.span layoutId="bo-timer" transition={spring.snappy} className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" />}
                {m ? `${m} min` : 'No limit'}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-400">{minutes ? 'When time is up, everyone gets 30 seconds, then comes back to the main call.' : 'The rooms stay open until you close them.'}</p>
        </section>
      </div>
      <div className="p-3 border-t border-white/10">
        <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={mode !== 'choose' && placed === 0}
          onClick={() => onOpen({ action: 'bo-open', rooms: count, assign: plan, minutes, choose: mode === 'choose' })}
          className="w-full py-3 rounded-2xl font-bold bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/25 disabled:opacity-40">
          Open {count} {count === 1 ? 'room' : 'rooms'}
        </motion.button>
        {mode !== 'choose' && placed === 0 && <p className="text-[11px] text-zinc-500 text-center mt-1.5">Nobody to put in rooms yet.</p>}
      </div>
    </>
  );
}

/** While the rooms are open: who's where, visits, moving people, a message for every room, time, closing. */
function Running({ bo, people, room, send, onJoin }: {
  bo: BreakoutView; people: { id: string; name: string; host?: boolean }[]; room: number | null;
  send: (msg: BreakoutMsg) => void; onJoin: (n: number | null) => void;
}) {
  const now = useTick(true);
  const [note, setNote] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const plan = bo.people ?? [];
  const left = bo.endsAt ? bo.endsAt - now : null;
  // In the main call: people here who aren't in a room yet (by peer id; I can see them).
  const unplaced = room === null ? people.filter((p) => !plan.some((x) => x.name === p.name && x.n > 0)) : [];
  const roomMenu = (key: string, current: number, pick: (n: number) => void) => (
    <AnimatePresence>
      {moving === key && (
        <motion.div key="menu" initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={spring.snappy}
          className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Move to">
          {[0, ...bo.rooms.map((r) => r.n)].filter((n) => n !== current).map((n) => (
            <button key={n} type="button" onClick={() => { pick(n); setMoving(null); }} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-semibold">
              {n ? bo.rooms.find((r) => r.n === n)?.name : 'Main call'}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3">
        <div className={cn('rounded-2xl px-3 py-2.5 text-sm flex items-center gap-2', bo.closing ? 'bg-amber-400/15 text-amber-100' : 'bg-white/[0.05] text-zinc-200')} role="status">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {bo.closing ? <>Closing: everyone is back in <b className="tabular-nums">{mmss(bo.closing - now)}</b></> : left !== null ? <><b className="tabular-nums">{mmss(left)}</b> left</> : 'No time limit'}
          </span>
          {!bo.closing && <button type="button" onClick={() => send({ action: 'bo-time', minutes: Math.ceil(Math.max(0, left ?? 0) / 60_000) + 5 })} className="text-xs font-semibold text-indigo-200 hover:underline">+5 min</button>}
        </div>

        {room !== null && (
          <button type="button" onClick={() => onJoin(null)} className="w-full flex items-center gap-2 rounded-2xl px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-sm font-semibold">
            <ArrowLeft className="w-4 h-4" />Back to the main call
          </button>
        )}

        <ul className="space-y-2">
          {bo.rooms.map((r) => {
            const assigned = plan.filter((p) => p.n === r.n);
            const here = r.here ?? [];
            const visitors = here.filter((name) => !assigned.some((p) => p.name === name));
            return (
              <li key={r.n} className={cn('rounded-2xl border px-3 py-2.5', room === r.n ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.08]' : 'border-white/[0.07] bg-white/[0.03]')}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-semibold text-sm truncate">{r.name} <span className="text-zinc-400 font-normal">· {r.count} in</span></p>
                  {room === r.n
                    ? <span className="text-[11px] font-semibold text-fuchsia-200">You’re here</span>
                    : <button type="button" onClick={() => onJoin(r.n)} className="px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-xs font-semibold">Join</button>}
                </div>
                {(assigned.length > 0 || visitors.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {assigned.map((p) => {
                      const inside = here.includes(p.name);
                      return (
                        <button key={p.k} type="button" onClick={() => setMoving((m) => (m === p.k ? null : p.k))} aria-expanded={moving === p.k} title={inside ? `${p.name} is in this room. Tap to move` : `${p.name} hasn’t arrived yet. Tap to move`}
                          className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-xs">
                          <span className={cn('w-1.5 h-1.5 rounded-full', inside ? 'bg-emerald-400' : 'bg-zinc-500')} />{p.name}
                        </button>
                      );
                    })}
                    {visitors.map((name) => <span key={`v-${name}`} className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-xs text-indigo-100">{name} · visiting</span>)}
                  </div>
                )}
                {assigned.map((p) => <div key={`m-${p.k}`}>{roomMenu(p.k, p.n, (n) => send({ action: 'bo-assign', k: p.k, n }))}</div>)}
              </li>
            );
          })}
        </ul>

        {(unplaced.length > 0 || plan.some((p) => p.n === 0)) && (
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
            <p className="text-sm font-semibold inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-zinc-400" />In the main call</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unplaced.map((p) => (
                <button key={p.id} type="button" onClick={() => setMoving((m) => (m === p.id ? null : p.id))} aria-expanded={moving === p.id} className="px-2.5 py-0.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-xs">{p.name}</button>
              ))}
              {plan.filter((p) => p.n === 0 && !unplaced.some((u) => u.name === p.name)).map((p) => (
                <button key={p.k} type="button" onClick={() => setMoving((m) => (m === p.k ? null : p.k))} aria-expanded={moving === p.k} className="px-2.5 py-0.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-xs">{p.name}</button>
              ))}
            </div>
            {unplaced.map((p) => <div key={`m-${p.id}`}>{roomMenu(p.id, 0, (n) => send({ action: 'bo-assign', target: p.id, n }))}</div>)}
            {plan.filter((p) => p.n === 0).map((p) => <div key={`m0-${p.k}`}>{roomMenu(p.k, 0, (n) => send({ action: 'bo-assign', k: p.k, n }))}</div>)}
          </section>
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) { send({ action: 'bo-note', text: note.trim() }); setNote(''); } }} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" />Message every room</p>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. 5 minutes left, wrap up" aria-label="Message every room" className="flex-1 h-10 rounded-full bg-white/10 px-4 text-sm outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-fuchsia-400/50" />
            <button type="submit" disabled={!note.trim()} aria-label="Send to every room" className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </div>
        </form>
      </div>
      <div className="p-3 border-t border-white/10">
        {bo.closing ? (
          <button type="button" onClick={() => send({ action: 'bo-end' })} className="w-full py-3 rounded-2xl font-bold bg-rose-600 hover:bg-rose-500">Bring everyone back now</button>
        ) : (
          <button type="button" onClick={() => send({ action: 'bo-close' })} className="w-full py-3 rounded-2xl font-bold bg-white/10 hover:bg-white/15">Close rooms</button>
        )}
        <p className="text-[11px] text-zinc-500 text-center mt-1.5">{bo.closing ? 'Or wait: the countdown brings everyone back.' : 'Everyone gets 30 seconds to finish, then comes back.'}</p>
      </div>
    </>
  );
}

/**
 * The strip at the top while rooms are open: which room you're in and the time left, "ask for help"
 * and "pick another room" for everyone in a room, "back to the main call" for hosts visiting, and the
 * countdown when rooms close.
 */
export function BreakoutBar({ bo, room, mod, onHelp, onMain, onPick, onManage }: {
  bo: BreakoutView | null; room: number | null; mod: boolean;
  onHelp: () => void; onMain: () => void; onPick: () => void; onManage: () => void;
}) {
  const now = useTick(!!bo);
  const name = room ? bo?.rooms.find((r) => r.n === room)?.name ?? `Room ${room}` : null;
  const left = bo?.endsAt ? bo.endsAt - now : null;
  const show = !!bo && (room !== null || mod || bo.choose || !!bo.closing);
  const btn = 'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0';
  return (
    <AnimatePresence>
      {show && bo && (
        <motion.div key="bo-bar" role="status" initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.96 }} transition={spring.smooth}
          className={cn('pointer-events-auto w-full max-w-lg rounded-2xl border backdrop-blur-xl shadow-2xl px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2', bo.closing ? 'bg-[#2a1f12]/90 border-amber-400/30' : 'bg-[#16142b]/90 border-fuchsia-400/25')}>
          <DoorOpen className={cn('w-4 h-4 shrink-0', bo.closing ? 'text-amber-300' : 'text-fuchsia-300')} />
          <p className="text-sm flex-1 min-w-[10rem]">
            {bo.closing ? (
              <><span className="font-semibold">Rooms are closing.</span> <span className="text-zinc-300">Back to the main call in <b className="tabular-nums">{mmss(bo.closing - now)}</b></span></>
            ) : name ? (
              <><span className="font-semibold">{name}</span>{left !== null && <span className="text-zinc-300"> · <span className="tabular-nums">{mmss(left)}</span> left</span>}</>
            ) : mod ? (
              <><span className="font-semibold">Breakout rooms are open</span>{left !== null && <span className="text-zinc-300"> · <span className="tabular-nums">{mmss(left)}</span> left</span>}</>
            ) : (
              <><span className="font-semibold">Breakout rooms are open.</span> <span className="text-zinc-300">Pick one to join.</span></>
            )}
          </p>
          <div className="flex gap-2">
            {bo.closing && room !== null && <button type="button" onClick={onMain} className={cn(btn, 'bg-white/10 hover:bg-white/20')}>Go back now</button>}
            {!bo.closing && room !== null && !mod && <button type="button" onClick={onHelp} className={cn(btn, 'bg-white/10 hover:bg-white/20 inline-flex items-center gap-1')}><LifeBuoy className="w-3.5 h-3.5" />Ask for help</button>}
            {!bo.closing && !mod && bo.choose && <button type="button" onClick={onPick} className={cn(btn, 'bg-gradient-to-r from-indigo-500 to-fuchsia-500')}>{room !== null ? 'Switch room' : 'Choose a room'}</button>}
            {!bo.closing && room !== null && mod && <button type="button" onClick={onMain} className={cn(btn, 'bg-white/10 hover:bg-white/20')}>Main call</button>}
            {mod && <button type="button" onClick={onManage} className={cn(btn, 'bg-gradient-to-r from-indigo-500 to-fuchsia-500')}>Manage</button>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Picking your own room, when the host lets people choose. */
export function RoomPicker({ open, onClose, bo, onPick }: { open: boolean; onClose: () => void; bo: BreakoutView | null; onPick: (n: number) => void }) {
  return (
    <AnimatePresence>
      {open && bo && (
        <>
          <motion.div key="pick-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-30 bg-black/40" aria-hidden />
          <div key="pick" className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] z-40 px-3 flex justify-center pointer-events-none">
            <motion.div role="dialog" aria-label="Choose a breakout room" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={spring.smooth}
              className="pointer-events-auto w-full max-w-sm rounded-3xl bg-[#121830]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-2">
              <p className="px-3 pt-2 pb-1 text-sm font-semibold">Choose a room</p>
              <ul className="max-h-[50vh] overflow-y-auto">
                {bo.rooms.map((r) => (
                  <li key={r.n}>
                    <button type="button" onClick={() => { haptic('tap'); onPick(r.n); onClose(); }} aria-pressed={bo.mine === r.n}
                      className={cn('w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors', bo.mine === r.n ? 'bg-gradient-to-r from-indigo-500/40 to-fuchsia-500/40' : 'hover:bg-white/[0.08]')}>
                      <DoorOpen className="w-4 h-4 text-fuchsia-300 shrink-0" />
                      <span className="flex-1 font-medium">{r.name}</span>
                      <span className="text-xs text-zinc-400">{r.count} in</span>
                    </button>
                  </li>
                ))}
                {bo.mine !== null && (
                  <li>
                    <button type="button" onClick={() => { haptic('tap'); onPick(0); onClose(); }} className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-white/[0.08]">
                      <ArrowLeft className="w-4 h-4 shrink-0" /><span className="flex-1 font-medium">Back to the main call</span>
                    </button>
                  </li>
                )}
              </ul>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
