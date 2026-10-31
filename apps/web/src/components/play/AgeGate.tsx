'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { GAMES, tooYoung, type GameId } from '@/lib/play';
import { spring } from '@/lib/motion';

// Rated games (M36: 12+, 16+, 18+): an account whose birth date says younger can't play them (the
// server refuses too); without a birth date the player confirms their age once on this device.
// shortcut: the confirmation is the player's word, kept in localStorage, like most game ratings.

const KEY = (age: number) => `uv-age-ok-${age}`;
const confirmed = (age: number) => { try { return localStorage.getItem(KEY(age)) === '1'; } catch { return false; } };

/** What a rating needs: the game's name, its age and what earns it (a UniVerse Play game or STORMFALL). */
export interface Rated { name: string; age?: number; rated?: string }

/** Runs an action once the player may play the game: at once, after confirming, or never. */
export const useAgeGate = (game: GameId, age: number | null | undefined) => useRatingGate(GAMES[game], age, tooYoung(game, age ?? null));

/** The same gate for any rated game. */
export function useRatingGate(info: Rated, age: number | null | undefined, blocked = !!info.age && age != null && age < info.age) {
  const [ask, setAsk] = useState<null | (() => void)>(null);
  const rating = info.age;
  const guard = (action: () => void) => {
    if (!rating || (!blocked && (age != null || confirmed(rating)))) action();
    else setAsk(() => action);
  };
  const dialog = typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence>
      {ask && rating && <AgeDialog info={info} blocked={blocked} onYes={() => { try { localStorage.setItem(KEY(rating), '1'); } catch { /* private mode */ } const a = ask; setAsk(null); a(); }} onNo={() => setAsk(null)} />}
    </AnimatePresence>,
    document.body,
  );
  /** True when the game can start without asking (no rating, or an age known or confirmed). */
  const clear = !rating || (!blocked && (age != null || (typeof window !== 'undefined' && confirmed(rating))));
  return { guard, dialog, rating, blocked, clear };
}

/** The rating as a small badge (cards, the game's page). */
export function AgeBadge({ game, className = '' }: { game: GameId; className?: string }) {
  const r = GAMES[game].age;
  if (!r) return null;
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums ring-1 ${r >= 18 ? 'bg-red-600 text-white ring-red-700' : r >= 16 ? 'bg-orange-700 text-white ring-orange-800' : 'bg-zinc-800 text-white ring-zinc-900'} ${className}`} title={`Rated ${r}+: ${GAMES[game].rated}`}>{r}+</span>;
}

function AgeDialog({ info, blocked, onYes, onNo }: { info: Rated; blocked: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onNo}>
      <motion.div role="alertdialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-text" initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.snappy}
        onClick={(e) => e.stopPropagation()} className="dark w-full max-w-sm rounded-3xl bg-[#151517] p-6 text-center ring-1 ring-white/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-600 text-xl font-black text-white">{info.age}+</span>
        <h2 id="age-title" className="mt-4 text-xl font-bold text-white">{info.name} is rated {info.age}+</h2>
        <p id="age-text" className="mt-2 text-sm text-zinc-300">
          <ShieldAlert className="me-1 inline h-4 w-4 -mt-0.5 text-amber-300" aria-hidden />Contains {info.rated}.{' '}
          {blocked ? `Your account’s birth date says you’re under ${info.age}, so this game isn’t available yet.` : `Only play if you are ${info.age} or older.`}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {!blocked && <button type="button" onClick={onYes} className="btn-primary btn-lg w-full justify-center">I am {info.age} or older</button>}
          <button type="button" onClick={onNo} className="btn-secondary w-full justify-center" autoFocus={blocked}>{blocked ? 'OK' : 'Not now'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
