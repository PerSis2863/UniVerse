'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { Crown, Loader2, Play, Trophy } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Avatar } from '@/components/ui/Avatar';
import { Segmented } from '@/components/ui/Segmented';
import { fetcher } from '@/lib/fetcher';
import { GAMES, GAME_IDS, isGame, type GameId } from '@/lib/play';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { GameIcon } from './GameIcon';

// Leaderboards (/play/leaderboard): each person's best in a game, this week or ever, top 20, with
// bars against the game's best possible score. Names and pictures only.

interface Board { game: GameId; range: 'week' | 'all'; maxScore: number; rows: { rank: number; name: string; avatar: string | null; score: number; rounds: number; me: boolean }[]; mine: number | null }

export function Leaderboard() {
  const g = useSearchParams().get('g');
  const [game, setGame] = useState<GameId>(isGame(g) ? g : 'quiz');
  const [range, setRange] = useState<'week' | 'all'>('week');
  const { data } = useSWR<Board>(`/play/leaderboard?game=${game}&range=${range}`, fetcher, { keepPreviousData: true });
  const calm = useReducedMotion();
  const top = Math.max(1, ...(data?.rows.map((r) => r.score) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Game">
        {GAME_IDS.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={game === x} onClick={() => setGame(x)}
            className={cn('relative flex items-center gap-2.5 rounded-2xl border p-3 text-start text-sm font-semibold transition-[border-color,transform] duration-150 active:scale-[0.98]',
              game === x ? 'border-pink-500 text-zinc-900 dark:text-white' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300')}>
            {game === x && <motion.span layoutId="board-game" className="absolute inset-0 rounded-2xl bg-pink-500/10" transition={spring.snappy} aria-hidden />}
            <GameIcon game={x} size="sm" />
            <span className="relative">{GAMES[x].name}</span>
          </button>
        ))}
      </div>

      <section className="panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white"><Trophy className="w-5 h-5 text-pink-500" aria-hidden />{GAMES[game].name}</h2>
          <Segmented<'week' | 'all'> label="Time" value={range} onChange={setRange} segments={[{ value: 'week', label: 'This week' }, { value: 'all', label: 'All time' }]} className="ms-auto" />
        </div>
        {data && data.mine !== null && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Your best {range === 'week' ? 'this week' : 'ever'}: <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">{data.mine.toLocaleString()}</span></p>}

        {!data && <div className="grid h-48 place-items-center"><Loader2 className="w-6 h-6 animate-spin text-pink-500" aria-label="Loading" /></div>}
        {data && data.rows.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Nobody has played {GAMES[game].name} {range === 'week' ? 'this week' : 'yet'}. The top spot is yours to take.</p>
            <Link href={`/play/game?g=${game}`} className="btn-primary mt-4"><Play className="w-4 h-4" aria-hidden />Play {GAMES[game].name}</Link>
          </div>
        )}
        <ol className="mt-4 space-y-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {data?.rows.map((r, i) => (
              <motion.li key={`${data.game}-${data.range}-${r.rank}`} layout initial={{ opacity: 0, y: calm ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...spring.smooth, delay: Math.min(i, 10) * 0.03 }}
                className={cn('relative overflow-hidden rounded-xl px-3 py-2.5', r.me ? 'bg-pink-500/10 ring-1 ring-pink-500/40' : 'bg-zinc-50 dark:bg-white/[0.04]')}>
                <span className="bar-grow absolute inset-y-0 start-0 w-full bg-gradient-to-r from-fuchsia-500/15 to-pink-500/5 rtl:bg-gradient-to-l" style={{ transform: `scaleX(${r.score / top})`, animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-hidden />
                <span className="relative flex items-center gap-3 text-sm">
                  <span className={cn('grid h-7 w-7 place-items-center rounded-full text-xs font-bold tabular-nums', r.rank === 1 ? 'bg-amber-400 text-amber-950' : r.rank <= 3 ? 'bg-[#2a2927] text-white' : 'text-zinc-500 dark:text-zinc-400')}>
                    {r.rank === 1 ? <Crown className="w-4 h-4" aria-label="First" /> : r.rank}
                  </span>
                  <Avatar name={r.name} src={r.avatar} size={28} />
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-100" translate="no">{r.name}{r.me && <span className="ms-1.5 text-xs font-semibold text-pink-600 dark:text-pink-300">You</span>}</span>
                  <span className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">{r.rounds} round{r.rounds === 1 ? '' : 's'}</span>
                  <span className="w-16 text-end font-semibold tabular-nums text-zinc-900 dark:text-white">{r.score.toLocaleString()}</span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {data && data.rows.length > 0 && <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Best possible in {GAMES[game].name}: {data.maxScore.toLocaleString()}. Solo rounds and rooms both count.</p>}
      </section>
    </div>
  );
}
