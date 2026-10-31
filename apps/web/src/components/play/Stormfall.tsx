'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { ArrowRight, Crosshair, Expand, Keyboard, Loader2, Monitor, MousePointer2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { fetcher } from '@/lib/fetcher';
import { useRatingGate, type Rated } from './AgeGate';
import type { PlayMe } from './GameShell';

// STORMFALL (M41): a Unity battle royale (source in games/stormfall at the repo root), built for the
// web into public/games/stormfall by scripts/stormfall-web.mjs (which also keeps the page inside
// this site's Content-Security-Policy). It needs a keyboard and mouse, so it is offered only on
// computers: no card on phones or tablets, and its page says so there. Scores stay in the game.

export const STORMFALL: Rated = { name: 'STORMFALL', age: 16, rated: 'realistic military shooting' };
const BASE = '/games/stormfall/stormfall';
/** The download, for the intro (the four build files together, compressed). */
export const STORMFALL_MB = 12;

const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(DESKTOP); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
/** True on a computer with a mouse and a wide screen (false while rendering on the server). */
export const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);

/** The card on /play, shown only on computers. */
export function StormfallCard() {
  const desktop = useDesktop();
  if (!desktop) return null;
  return (
    <Link href="/play/stormfall" className="sheen panel group relative flex h-full flex-col overflow-hidden p-5 transition-transform duration-200 active:scale-[0.99]">
      <span className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-amber-500 opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-40" aria-hidden />
      <span className="relative flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-[0_0_24px_rgba(245,158,11,0.45)]"><Crosshair className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Computer only</span>
          <span className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">{STORMFALL.name}<Rating /></span>
        </span>
      </span>
      <span className="relative mt-4 block rounded-2xl bg-zinc-100/80 p-3 dark:bg-white/[0.04]">
        <span className="play-scene relative flex h-[76px] items-end gap-1.5 overflow-hidden rounded-xl p-2.5" style={{ background: 'radial-gradient(70% 90% at 70% 0%,#d9f99d55,transparent 60%),linear-gradient(160deg,#1f2a1c,#4b5a2c 50%,#c9a24a)' }} aria-hidden>
          {['battle royale', 'parachute in', 'last one standing'].map((t) => <span key={t} className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{t}</span>)}
        </span>
      </span>
      <span className="relative mt-4 block text-sm text-zinc-600 dark:text-zinc-300">Drop onto Kaldera Isle, loot, buy, and outlast 24 soldiers as the Blight closes in.</span>
      <span className="relative mt-4 flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">Play<ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden /></span>
        <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-bold text-fuchsia-800 dark:text-fuchsia-300">New · 3D</span>
        <span className="ms-auto text-xs text-zinc-500 dark:text-zinc-400">About 20 min · solo</span>
      </span>
    </Link>
  );
}

const Rating = () => <span className="inline-flex items-center rounded-md bg-orange-700 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white ring-1 ring-orange-800" title={`Rated ${STORMFALL.age}+: ${STORMFALL.rated}`}>{STORMFALL.age}+</span>;

interface UnityInstance { Quit: () => Promise<void>; SetFullscreen: (on: 0 | 1) => void }
type CreateUnity = (canvas: HTMLCanvasElement, config: Record<string, unknown>, progress: (p: number) => void) => Promise<UnityInstance>;

let loader: Promise<CreateUnity> | null = null;
/** Loads Unity's loader script once per visit. */
function loadUnity(): Promise<CreateUnity> {
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${BASE}.loader.js`;
    s.async = true;
    s.onload = () => { const f = (window as unknown as { createUnityInstance?: CreateUnity }).createUnityInstance; if (f) resolve(f); else reject(new Error('The game loader did not start.')); };
    s.onerror = () => { loader = null; reject(new Error('The game could not be downloaded.')); };
    document.body.appendChild(s);
  });
  return loader;
}

/** The game page: the computer check, the 16+ gate, the download, then the game. */
export function StormfallPlayer() {
  const desktop = useDesktop();
  const { data: me } = useSWR<PlayMe>('/play/me', fetcher);
  const gate = useRatingGate(STORMFALL, me?.age);
  const [phase, setPhase] = useState<'intro' | 'loading' | 'playing' | 'error'>('intro');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<UnityInstance | null>(null);

  useEffect(() => () => { void instance.current?.Quit().catch(() => undefined); instance.current = null; }, []);

  const start = () => gate.guard(async () => {
    setPhase('loading');
    try {
      const create = await loadUnity();
      if (!canvas.current) return;
      instance.current = await create(canvas.current, {
        dataUrl: `${BASE}.data.unityweb`,
        frameworkUrl: `${BASE}.framework.js`,
        codeUrl: `${BASE}.wasm.unityweb`,
        streamingAssetsUrl: '/games/stormfall/StreamingAssets',
        companyName: 'UniVerse',
        productName: 'STORMFALL',
        productVersion: '1.0',
      }, (p) => setProgress(p));
      setPhase('playing');
      canvas.current.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  });

  if (!desktop) {
    return (
      <section className="panel mx-auto max-w-lg p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10"><Monitor className="h-6 w-6 text-zinc-700 dark:text-zinc-200" aria-hidden /></span>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">{STORMFALL.name} needs a computer</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">It’s played with a keyboard and mouse on a big screen, so it isn’t available on phones or tablets. Open UniVerse Play on a computer to play it.</p>
        <Link href="/play" className="btn-primary mt-5">Back to Play</Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {gate.dialog}
      <section className="panel overflow-hidden p-0">
        <div className="relative aspect-video w-full bg-black">
          <canvas ref={canvas} id="stormfall-canvas" tabIndex={-1} className={`absolute inset-0 h-full w-full outline-none ${phase === 'playing' ? '' : 'invisible'}`} aria-label="STORMFALL game" />
          {phase !== 'playing' && (
            <div className="dark absolute inset-0 grid place-items-center p-6 text-center" style={{ background: 'radial-gradient(70% 90% at 70% 0%,#d9f99d33,transparent 60%),linear-gradient(160deg,#141a12,#2f3a1c 55%,#6b5524)' }}>
              <div className="max-w-md">
                <h2 className="flex items-center justify-center gap-2 text-3xl font-black tracking-wide text-white">{STORMFALL.name}<Rating /></h2>
                <p className="mt-2 text-sm text-zinc-200">Ride the cargo plane over Kaldera Isle, jump, loot weapons and armour, and be the last one standing as the Blight closes in.</p>
                {phase === 'intro' && (
                  <button type="button" onClick={start} className="btn-primary btn-lg mt-6 justify-center">Deploy{STORMFALL_MB > 0 ? ` · ${STORMFALL_MB} MB download` : ''}</button>
                )}
                {phase === 'loading' && (
                  <div className="mx-auto mt-6 w-64" role="progressbar" aria-label="Downloading the game" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-amber-400 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-300"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{progress < 0.9 ? `Downloading ${Math.round(progress * 100)}%` : 'Building the island…'}</p>
                  </div>
                )}
                {phase === 'error' && (
                  <div className="mt-6">
                    <p className="text-sm text-red-300" role="alert">{error || 'The game could not start.'} Your browser needs WebGL 2.</p>
                    <button type="button" onClick={() => { setPhase('intro'); setProgress(0); }} className="btn-secondary mt-3">Try again</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
          <span className="inline-flex items-center gap-1.5"><MousePointer2 className="h-4 w-4" aria-hidden />Click the game to aim with the mouse · Esc frees the cursor</span>
          <span className="inline-flex items-center gap-1.5"><Keyboard className="h-4 w-4" aria-hidden />WASD move · Shift sprint · C crouch/slide · Space jump · R reload · G armour · F use · M map</span>
          {phase === 'playing' && <button type="button" onClick={() => instance.current?.SetFullscreen(1)} className="btn-secondary ms-auto"><Expand className="h-4 w-4" aria-hidden />Full screen</button>}
        </div>
      </section>
    </div>
  );
}
