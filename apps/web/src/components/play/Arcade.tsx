'use client';

import useSWR from 'swr';
import { m as motion, useReducedMotion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Gamepad2, Trophy, User, Users } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Rolling } from '@/components/ui/Rolling';
import { fetcher } from '@/lib/fetcher';
import { appById } from '@/lib/apps';
import { GAMES, GAME_IDS, type GameId } from '@/lib/play';
import { ITEMS } from '@/lib/play/sort';
import { spring } from '@/lib/motion';
import { AgeBadge } from './AgeGate';
import { PlayerCard } from './PlayerCard';
import { GameIcon } from './GameIcon';
import { JoinRoom, type PlayMe } from './GameShell';

// UniVerse Play's home (/play): twelve games, two for each app (four quick, four big) and four 3D worlds, each card
// with a small live scene of how it plays; join a room by code; my numbers and last rounds. Scenes are CSS only and stop
// with Reduce Motion.

const WORLD_ART: Partial<Record<GameId, { bg: string; tags: string[] }>> = {
  obby: { bg: 'linear-gradient(160deg,#2b59ff,#9b8cff 55%,#ffb3d9)', tags: ['10 stages', 'bounce pads', 'lasers'] },
  strike: { bg: 'linear-gradient(160deg,#1a1030,#4c1d95 60%,#a855f7)', tags: ['waves', 'combos', 'power-ups'] },
  night: { bg: 'radial-gradient(60% 60% at 50% 55%,#e5e7eb 0%,#3f3f46 18%,#09090b 60%)', tags: ['torch', '5 keys', 'don’t get caught'] },
  orbit: { bg: 'radial-gradient(80% 80% at 20% 110%,#1d4ed8,#02030a 60%)', tags: ['low gravity', 'reactors', 'meteors'] },
};

function Scene({ game }: { game: GameId }) {
  const art = WORLD_ART[game];
  if (art) {
    return (
      <div className="play-scene relative flex h-[76px] items-end gap-1.5 overflow-hidden rounded-xl p-2.5" style={{ background: art.bg }} aria-hidden>
        {art.tags.map((t) => <span key={t} className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{t}</span>)}
      </div>
    );
  }
  if (game === 'quiz') {
    return (
      <div className="play-scene grid grid-cols-2 gap-1.5" aria-hidden>
        {['Pacific', 'Atlantic', 'Indian', 'Arctic'].map((o, i) => (
          <span key={o} className={`rounded-lg px-2 py-1.5 text-[11px] font-medium ${i === 0 ? 'bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/50 dark:text-emerald-200' : 'bg-white/70 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}>{o}</span>
        ))}
      </div>
    );
  }
  if (game === 'fakes') {
    return (
      <div className="play-scene grid grid-cols-4 gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="relative h-14 rounded-lg bg-white/80 p-1.5 dark:bg-white/10">
            <span className="block h-1.5 w-3/4 rounded bg-zinc-300 dark:bg-white/20" /><span className="mt-1 block h-1.5 w-1/2 rounded bg-zinc-200 dark:bg-white/10" />
            {i === 2 && <span className="absolute inset-x-1 bottom-1.5 -rotate-12 rounded border-2 border-red-500 text-center text-[11px] font-black leading-tight text-red-500">COPY</span>}
          </span>
        ))}
      </div>
    );
  }
  if (game === 'supply') {
    return (
      <div className="relative grid h-16 grid-cols-6 gap-1" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => <span key={i} className="rounded bg-white/60 dark:bg-white/[0.06]" />)}
        {[[18, 30, '#38bdf8'], [62, 70, '#f97316'], [85, 25, '#ef4444']].map(([x, y, c], i) => (
          <span key={i} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="play-ripple absolute inset-0 rounded-full" style={{ background: c as string, animationDelay: `${i * -0.5}s` }} />
            <span className="relative block h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-[#1B1B1E]" style={{ background: c as string }} />
          </span>
        ))}
      </div>
    );
  }
  if (game === 'type') {
    return (
      <div className="space-y-1.5" aria-hidden>
        {[['You', '78%', 'bg-pink-600'], ['Maya', '62%', 'bg-[#2a2927]'], ['Omar', '45%', 'bg-[#2a2927]']].map(([n, w, c], i) => (
          <div key={n} className="relative h-5 rounded-full bg-white/60 dark:bg-white/[0.06]">
            <span className={`play-scene-car absolute top-0.5 h-4 rounded-full px-2 text-[11px] font-bold leading-4 text-white ${c}`} style={{ insetInlineStart: `calc(${w} - 3.5rem)`, animationDelay: `${i * -0.7}s` }}>🏎️ {n}</span>
          </div>
        ))}
      </div>
    );
  }
  if (game === 'pin') {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl bg-[#0a1721]" aria-hidden>
        <svg viewBox="0 0 200 80" className="absolute inset-0 h-full w-full opacity-70"><path d="M20 30q15-12 32-6t22 2 18 10-6 18-28 8-26-6-12-26zm80-14q20-6 40 2t30 16-10 20-34 4-26-14 0-28zm12 40q10-2 16 6t-6 14-14-8 4-12z" fill="#172a38" stroke="#2a4153" /></svg>
        <span className="absolute left-[30%] top-[38%] h-3 w-3 -translate-x-1/2 -translate-y-1/2"><span className="play-ripple absolute inset-0 rounded-full bg-emerald-400" /><span className="relative block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" /></span>
        <span className="absolute left-[38%] top-[52%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500 ring-2 ring-white" />
        <svg viewBox="0 0 200 80" className="absolute inset-0 h-full w-full"><path d="M76 42L60 30" stroke="#f472b6" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
        <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[#141416]">Paris · 312 km</span>
      </div>
    );
  }
  if (game === 'rescue') {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-b from-[#0b1620] to-[#2a2927]" aria-hidden>
        {[8, 26, 44, 62].map((x, i) => <span key={x} className="absolute bottom-0 w-8 bg-[#5F5C57]" style={{ left: `${x}%`, height: `${40 + ((i * 17) % 30)}%` }} />)}
        <span className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-b from-sky-600/80 to-sky-950" />
        <span className="play-scene-heli absolute top-3 text-2xl" style={{ left: '30%' }}>🚁</span>
        <span className="absolute bottom-[50%] text-base" style={{ left: '28%' }}>🙋</span>
        <span className="absolute bottom-[34%] end-2 grid h-6 w-6 place-items-center rounded bg-white text-[11px] font-black text-red-600">H</span>
      </div>
    );
  }
  if (game === 'ocean') {
    return (
      <div className="relative h-24 overflow-hidden rounded-xl bg-gradient-to-b from-[#0e3a4f] to-[#0B0B0C]" aria-hidden>
        <div className="play-scene absolute inset-x-4 top-2 flex justify-between text-xl"><span>🧴</span><span>🐢</span><span>🛍️</span><span>🥫</span></div>
        <span className="absolute bottom-3 left-1/2 h-7 w-5 -translate-x-1/2 rounded-t-full bg-white shadow-[0_0_16px_rgba(236,72,153,0.6)]"><span className="absolute inset-x-0 bottom-0 h-1.5 bg-pink-500" /></span>
        <span className="absolute bottom-1 left-1/2 h-3 w-16 -translate-x-1/2 rounded-full border-t border-sky-100/30" />
      </div>
    );
  }
  return (
    <div className="relative h-16 overflow-hidden rounded-xl bg-white/50 dark:bg-white/[0.05]" aria-hidden>
      <div className="absolute inset-x-0 bottom-2 h-1.5 overflow-hidden bg-zinc-300 dark:bg-white/10"><div className="play-stripes h-full w-[calc(100%+48px)] bg-[repeating-linear-gradient(90deg,transparent_0_20px,rgba(0,0,0,0.15)_20px_24px)]" /></div>
      <div className="play-scene absolute inset-x-3 top-2 flex justify-between">
        {[0, 8, 22, 26].map((k) => <span key={k} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-xl shadow-sm dark:bg-[#141416]">{ITEMS[k][1]}</span>)}
      </div>
    </div>
  );
}

export function Arcade() {
  const { data: me } = useSWR<PlayMe>('/play/me', fetcher);
  const calm = useReducedMotion();
  const bestTotal = me ? GAME_IDS.reduce((n, g) => n + (me.games[g]?.best ?? 0), 0) : 0;
  const withFriends = me ? GAME_IDS.reduce((n, g) => n + (me.games[g]?.multi ?? 0), 0) : 0;

  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden p-5 sm:p-8">
        <div className="pointer-events-none absolute -start-20 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-800 dark:text-fuchsia-300"><Gamepad2 className="w-3.5 h-3.5" aria-hidden />UniVerse Play</p>
            <h1 className="mt-3 text-3xl font-semibold text-zinc-900 dark:text-white sm:text-4xl">Games that <em className="font-serif text-pink-600 dark:text-pink-300">teach</em> something.</h1>
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-300">3D worlds to run, jump and survive in, plus two games for each app. Every round earns XP: level up to unlock new looks. Play alone or race friends live in a room.</p>
            <dl className="mt-6 grid max-w-md grid-cols-3 gap-4">
              <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Rounds played</dt><dd className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={me?.played ?? 0} /></dd></div>
              <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">With friends</dt><dd className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={withFriends} /></dd></div>
              <div><dt className="text-xs text-zinc-500 dark:text-zinc-400">Best, all games</dt><dd className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white"><Rolling value={bestTotal} /></dd></div>
            </dl>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">Got a room code?</p>
            <JoinRoom compact />
          </div>
        </div>
      </section>

      {me && <PlayerCard xp={me.xp ?? 0} />}

      {(['worlds', 'big', 'quick'] as const).map((kind) => (
        <section key={kind} aria-labelledby={`games-${kind}`}>
          <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <h2 id={`games-${kind}`} className="text-lg font-semibold text-zinc-900 dark:text-white">{kind === 'worlds' ? '3D worlds' : kind === 'big' ? 'Big games' : 'Quick games'}</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{kind === 'worlds' ? 'Run, jump, explore and survive in 3D: an obby, laser tag, horror and space.' : kind === 'big' ? 'Full-screen, longer rounds: fly, steer, type and explore.' : 'A minute each, perfect between classes.'}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {GAME_IDS.filter((g) => (kind === 'worlds' ? !!GAMES[g].world : !GAMES[g].world && !!GAMES[g].big === (kind === 'big'))).map((g, i) => {
          const info = GAMES[g], mine = me?.games[g];
          return (
            <motion.div key={g} initial={{ opacity: 0, y: calm ? 0 : 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: 0.05 * i }}>
              <Link href={`/play/game?g=${g}`} className="sheen panel group relative flex h-full flex-col overflow-hidden p-5 transition-transform duration-200 active:scale-[0.99]">
                <span className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-40" style={{ background: info.color }} aria-hidden />
                <span className="relative flex items-start gap-3">
                  <GameIcon game={g} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300"><span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} aria-hidden />{appById(info.app).name}</span>
                    <span className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">{info.name}<AgeBadge game={g} /></span>
                  </span>
                  {mine && mine.best > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-white/10 dark:text-zinc-200"><Trophy className="w-3 h-3" aria-hidden />{mine.best.toLocaleString()}</span>}
                </span>
                <span className="relative mt-4 block rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]"><Scene game={g} /></span>
                <span className="relative mt-4 block text-sm text-zinc-600 dark:text-zinc-300">{info.tagline}</span>
                <span className="relative mt-4 flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">Play<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden /></span>
                  {info.world && <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-bold text-fuchsia-800 dark:text-fuchsia-300">New · 3D</span>}
                  <span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">{Math.round(info.seconds / 6) / 10} min · solo or up to 8</span>
                </span>
              </Link>
            </motion.div>
          );
            })}
          </div>
        </section>
      ))}

      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900 dark:text-white">Your last rounds</h2>
          <Link href="/play/leaderboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-pink-600 dark:text-pink-300"><Trophy className="w-4 h-4" aria-hidden />Leaderboards</Link>
        </div>
        {me && me.recent.length === 0 && <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No rounds yet. Pick a game above: a solo round takes about a minute.</p>}
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-white/10">
          {me?.recent.map((r, i) => {
            const Mode = r.mode === 'multi' ? Users : User;
            return (
              <li key={`${r.createdAt}-${i}`} className="flex items-center gap-3 py-2.5 text-sm">
                <GameIcon game={r.game} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100">{GAMES[r.game]?.name ?? r.game}</span>
                <span className="hidden items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:inline-flex"><Mode className="w-3.5 h-3.5" aria-hidden />{r.mode === 'multi' ? 'With friends' : 'Solo'}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                <span className="w-16 text-end font-semibold tabular-nums text-zinc-900 dark:text-white">{r.score.toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
