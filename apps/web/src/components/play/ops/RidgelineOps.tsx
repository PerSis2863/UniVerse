'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bomb, Monitor, Bone, Car, Cloud, CloudRain, Cross, Droplets, Eye, Fuel, HeartPulse, Keyboard, Moon, MousePointer2, Plane, Radar, Radio, Shield, Skull, Syringe, Timer, X, Zap } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { MAP_SIZE, RARITY, opsMap } from '@/lib/play/ops';
import { cn } from '@/lib/utils';
import type { GameProps } from '../game-props';
import { WorldFrame } from '../world/Stage';
import type { Controls } from '../world/core';
import { OpsGame } from './game';
import { compassPlaces } from './hud-draw';
import { BuyMenu, InventoryMenu, MapMenu, SafehouseMenu } from './menus';
import { GunSilhouette } from './silhouettes';
import type { Banner, FeedLine, HitKind, HudState, Menu } from './types';

// Ridgeline Ops on screen (rules: src/lib/play/ops; the game: ./game.ts). The canvas, the tactical
// HUD (a degree compass with place markers, a minimap that turns with you, health with three armour
// plates and status icons, the gun with its rarity, magazine and fire mode, hitmarkers, a red arc
// toward whoever hit you, prompts, the radio and kill feed, banners, the extraction countdown, the
// vehicle's gauges) and the menus. The game draws the parts that change every frame straight onto
// the page; React re-renders at most ten times a second and only when something changed.

const RC = (r: number) => RARITY[r]?.color ?? '#a1a1aa';
const DIRS: [string, number][] = [['N', 0], ['15', 15], ['30', 30], ['NE', 45], ['60', 60], ['75', 75], ['E', 90], ['105', 105], ['120', 120], ['SE', 135], ['150', 150], ['165', 165], ['S', 180], ['195', 195], ['210', 210], ['SW', 225], ['240', 240], ['255', 255], ['W', 270], ['285', 285], ['300', 300], ['NW', 315], ['330', 330], ['345', 345]];
/** The controls, shown with F1 (the bottom strip is gone: it covered the HUD). */
const CONTROLS: [string, [string, string][]][] = [
  ['Move', [['W A S D', 'Walk'], ['Shift', 'Sprint · tap twice: tactical sprint'], ['C', 'Crouch · slide when sprinting'], ['Z', 'Prone'], ['Space', 'Jump · vault · mantle'], ['Q / hold E', 'Lean left / right']]],
  ['Fight', [['Left click', 'Fire'], ['Right click', 'Aim down sights'], ['Shift (scope)', 'Hold your breath'], ['R', 'Reload'], ['B', 'Fire mode'], ['1 / 2 / 3 · X', 'Weapons · swap'], ['I', 'Inspect your gun'], ['G / V', 'Frag · flash or smoke'], ['5', 'Killstreak (UAV, airstrike)']]],
  ['Kit', [['4', 'Armour plate'], ['H', 'First aid'], ['8', 'Bandage'], ['6', 'Splint'], ['7', 'Adrenaline'], ['N', 'Night vision'], ['Tab', 'Backpack and gunsmith']]],
  ['World', [['F', 'Use · loot · drive'], ['E (tap)', 'Call the extraction helicopter'], ['M', 'Map'], ['Y', 'Rain on or off'], ['F1', 'These controls'], ['Esc', 'Free the mouse']]],
];
const PHONE_BUTTONS = [{ id: 'inv', label: 'Bag' }, { id: 'nvg', label: 'NVG' }, { id: 'plate', label: 'Plate' }, { id: 'heal', label: 'Med' }, { id: 'throw', label: 'Nade' }, { id: 'swap', label: 'Swap' }, { id: 'crouch', label: 'Crouch' }, { id: 'act', label: 'Use' }, { id: 'skill', label: 'Reload' }, { id: 'jump', label: 'Jump' }, { id: 'aim', label: 'Aim' }, { id: 'fire', label: 'Fire' }] as const;

export function RidgelineOps(props: GameProps) {
  // A computer game: on a phone or tablet with no mouse it isn't playable, so it says so instead.
  const [touchOnly] = useState(() => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
  if (touchOnly) return (
    <div className="mx-auto grid min-h-[420px] w-full max-w-xl place-items-center rounded-[1.75rem] bg-zinc-950 p-6 text-center ring-1 ring-white/10">
      <div>
        <Monitor className="mx-auto h-10 w-10 text-lime-300" aria-hidden />
        <p className="mt-3 text-xl font-black text-white">Ridgeline Ops needs a computer</p>
        <p className="mt-2 text-sm text-zinc-300">It&apos;s played with a mouse and keyboard: aiming, leaning, reloading and the rest don&apos;t fit on a touch screen. Open UniVerse Play on a laptop or desktop to drop in.</p>
      </div>
    </div>
  );
  return <OpsPlay {...props} />;
}

function OpsPlay({ seed, endsAt, clock, onProgress, onStats, net }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const compass = useRef<HTMLDivElement>(null), mini = useRef<HTMLCanvasElement>(null), big = useRef<HTMLCanvasElement>(null), reticle = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), cardText = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const game = useRef<OpsGame | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [hit, setHit] = useState<{ n: number; kind: HitKind }>({ n: 0, kind: 'flesh' });
  const [hurt, setHurt] = useState<{ n: number; a: number }[]>([]);
  const out = useRef({ onProgress, onStats, net });
  useEffect(() => { out.current = { onProgress, onStats, net }; });
  const map = useMemo(() => opsMap(seed), [seed]);
  const marks = useMemo(() => compassPlaces(map), [map]);
  const lzs = useMemo(() => map.places.filter((p) => p.kind === 'lz').map((p) => ({ name: p.name, x: (p.x + MAP_SIZE / 2) / MAP_SIZE, y: (p.z + MAP_SIZE / 2) / MAP_SIZE })), [map]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let id = 0;
    const g = new OpsGame(el, seed, clock, endsAt, {
      hud: setHud,
      feed: (l) => { const n = ++id; setFeed((f) => [...f.slice(-4), { ...l, id: n }]); setTimeout(() => setFeed((f) => f.filter((x) => x.id !== n)), l.kind === 'radio' ? 5000 : 4000); },
      banner: (b) => { const n = ++id; setBanner({ ...b, id: n }); setTimeout(() => setBanner((x) => (x?.id === n ? null : x)), 3600); },
      hit: (kind) => setHit((h) => ({ n: h.n + 1, kind })),
      hurt: (a) => { const n = ++id; setHurt((h) => [...h.slice(-3), { n, a }]); setTimeout(() => setHurt((h) => h.filter((x) => x.n !== n)), 1000); },
      menu: setMenu,
      score: (score, kills, stats) => { out.current.onProgress(score, kills); out.current.onStats?.(stats); },
    }, () => ({ compass: compass.current, mini: mini.current, big: big.current, reticle: reticle.current, card: card.current, cardText: cardText.current }), () => out.current.net);
    game.current = g; controls.current = g.c;
    g.scored();
    return () => { g.dispose(); game.current = null; controls.current = null; };
  }, [seed, clock, endsAt]);

  const close = useCallback(() => game.current?.closeMenu(), []);
  // F1: the controls; whether the mouse is captured (to say "click to look around" when it isn't).
  const [help, setHelp] = useState(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setHelp((h) => !h); }
      else if (e.key === 'Escape') setHelp((h) => { if (h) { e.preventDefault(); e.stopImmediatePropagation(); } return false; });
    };
    const lock = () => setLocked(!!document.pointerLockElement && document.pointerLockElement === canvas.current);
    window.addEventListener('keydown', key, true); document.addEventListener('pointerlockchange', lock);
    return () => { window.removeEventListener('keydown', key, true); document.removeEventListener('pointerlockchange', lock); };
  }, []);
  // Escape closes the bag, the map or the buy station first (before the arena asks about leaving).
  const closable = menu?.kind === 'inventory' || menu?.kind === 'buy' || menu?.kind === 'map';
  useEffect(() => {
    if (!closable) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [closable, close]);
  const phase = hud?.phase ?? 'safehouse';
  const inRaid = phase === 'raid' || phase === 'range';
  const hours = hud ? Math.floor(hud.hour) : 16, mins = hud ? Math.floor((hud.hour % 1) * 60) : 0;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={PHONE_BUTTONS.map((b) => ({ ...b }))} className="h-[min(calc(100dvh-10rem),900px)]"
        keys=""
        label="Ridgeline Ops: a first-person open-world extraction shooter">
        {/* Cinematic bars flying in and out */}
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[9%] origin-top bg-black transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]', phase === 'insert' || phase === 'exfil' ? 'scale-y-100' : 'scale-y-0')} />
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-[9%] origin-bottom bg-black transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]', phase === 'insert' || phase === 'exfil' ? 'scale-y-100' : 'scale-y-0')} />

        {/* The phone path has no effects chain: the scope and night vision as overlays */}
        {hud?.scope && <div className="ops-scope pointer-events-none absolute inset-0 [@media(pointer:fine)]:hidden" aria-hidden />}
        {hud?.nvg && <div className="ops-nvg pointer-events-none absolute inset-0 [@media(pointer:fine)]:hidden" aria-hidden />}

        {inRaid && hud && (
          <>
            {/* Crosshair (its gap follows the spread), hitmarkers, a red arc toward who hit you */}
            <div ref={reticle} className="pointer-events-none absolute left-1/2 top-1/2 transition-opacity duration-100" style={{ '--gap': '8px' } as React.CSSProperties} aria-hidden>
              <span className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_2px_#000]" />
              {[['0', 'calc(-1 * var(--gap) - 9px)', 'h-2 w-[2px] -translate-x-1/2'], ['0', 'var(--gap)', 'h-2 w-[2px] -translate-x-1/2']].map(([x, y, c], i) => <span key={`v${i}`} className={cn('absolute bg-white shadow-[0_0_2px_#000]', c)} style={{ left: x, top: y }} />)}
              {[['calc(-1 * var(--gap) - 9px)', '0', 'h-[2px] w-2 -translate-y-1/2'], ['var(--gap)', '0', 'h-[2px] w-2 -translate-y-1/2']].map(([x, y, c], i) => <span key={`h${i}`} className={cn('absolute bg-white shadow-[0_0_2px_#000]', c)} style={{ left: x, top: y }} />)}
            </div>
            {hit.n > 0 && <span key={hit.n} className={cn('ops-hit pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2', hit.kind === 'kill' || hit.kind === 'head' ? 'ops-kill text-red-500' : hit.kind === 'armour' || hit.kind === 'break' ? 'text-sky-400' : 'text-white')} aria-hidden>{hit.kind === 'break' && <span className="ops-crack absolute inset-0" />}{(hit.kind === 'kill' || hit.kind === 'head') && <Skull className="absolute -top-7 left-1/2 h-5 w-5 -translate-x-1/2 drop-shadow" aria-hidden />}</span>}
            {hurt.map((h) => <span key={h.n} className="ops-dir pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" style={{ '--a': `${h.a}deg` } as React.CSSProperties} aria-hidden />)}
            {hud.hp < 35 && <span className="ops-low pointer-events-none absolute inset-0" aria-hidden />}
            <span className={cn('ops-ads pointer-events-none absolute inset-0 transition-opacity duration-200 [@media(pointer:fine)]:hidden', hud.aiming && !hud.scope ? 'opacity-100' : 'opacity-0')} aria-hidden />
            {/* Loot card over what you're looking at */}
            <div ref={card} className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-150" aria-hidden>
              <div ref={cardText} className="ops-loot whitespace-nowrap rounded-lg bg-black/80 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/20" />
            </div>
            {hud.prompt && (
              <p className="pointer-events-none absolute left-1/2 top-[60%] -translate-x-1/2 whitespace-nowrap [@media(pointer:coarse)]:top-[54%] rounded-md bg-black/65 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white ring-1 ring-white/15">
                {hud.prompt}
              </p>
            )}

            {/* Top: the compass with markers, the objective, being spotted */}
            <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1.5 px-28 sm:px-40 [@media(pointer:coarse)]:pe-[7.5rem] [@media(pointer:coarse)]:ps-3">
              <div ref={compass} className="relative h-8 w-full max-w-[460px] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]" aria-hidden>
                <div className="absolute left-1/2 top-0 h-full w-[2160px] will-change-transform">
                  {[0, 1, 2].flatMap((n) => DIRS.map(([d, deg]) => (
                    <span key={`${n}${d}`} className={cn('absolute -translate-x-1/2 font-black', d.length <= 2 && isNaN(Number(d)) ? 'top-1 text-[12px] text-white' : 'top-2 text-[9px] text-zinc-400')} style={{ left: n * 720 + deg * 2 }}>{d}</span>
                  )))}
                </div>
                {marks.map((p) => <span key={p.id} data-mark={p.id} className="absolute bottom-0 left-1/2 -translate-x-1/2 opacity-0"><span className={cn('block h-1.5 w-1.5 rotate-45', p.kind === 'lz' ? 'bg-amber-300' : 'bg-red-400')} /><i className="absolute -top-0.5 left-2 text-[8px] not-italic font-bold text-zinc-300" /></span>)}
                <span data-mark={-1} className="absolute bottom-0 left-1/2 -translate-x-1/2 opacity-0"><span className="block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white/70" /><i className="absolute -top-0.5 left-3 text-[8px] not-italic font-bold text-rose-200" /></span>
                <span className="absolute left-1/2 top-0 h-2 w-[2px] -translate-x-1/2 bg-amber-300" />
              </div>
              {hud.objective && <p className="max-w-full truncate rounded-md bg-black/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-100 ring-1 ring-white/10">{hud.objective}</p>}
              {hud.detect > 0.1 && <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full origin-center rounded-full', hud.detect >= 1 ? 'bg-red-500' : 'bg-amber-300')} style={{ transform: `scaleX(${hud.detect})` }} /></div>}
            </div>

            {/* Bottom left: the operator, three armour plate segments over a thick health bar, then kit and what's wrong */}
            <div className="pointer-events-none absolute bottom-4 start-4 w-60 space-y-1.5 rounded-lg bg-black/40 p-2.5 ring-1 ring-white/10 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[5.75rem] [@media(pointer:coarse)]:w-40 [@media(pointer:coarse)]:p-1.5">
              <div className="flex gap-1">
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className={cn('h-2.5 flex-1 -skew-x-12 overflow-hidden rounded-[2px] bg-white/10 ring-1', i < hud.plateMax ? 'ring-sky-300/30' : 'opacity-25 ring-transparent')}>
                    <span className="block h-full origin-left bg-gradient-to-r from-blue-500 to-sky-300 transition-transform duration-200 rtl:origin-right" style={{ transform: `scaleX(${Math.min(1, (hud.plates[i] ?? 0) / 75)})` }} />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3.5 flex-1 overflow-hidden rounded-[3px] bg-black/60 ring-1 ring-white/15"><div className={cn('h-full origin-left transition-transform duration-200 rtl:origin-right', hud.hp < 35 ? 'bg-red-500' : 'bg-white')} style={{ transform: `scaleX(${hud.hp / 100})` }} /></div>
                <span className="w-8 text-end text-sm font-black tabular-nums text-white">{hud.hp}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full origin-left bg-amber-200/80" style={{ transform: `scaleX(${hud.stamina / 100})` }} /></div>
              <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-zinc-100">
                <span className="inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5" title="Spare plates (4)"><Shield className="h-3 w-3 text-sky-300" aria-hidden />{hud.spares}</span>
                <span className="inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5" title="First aid · bandage · adrenaline · splint"><Cross className="h-3 w-3 text-red-300" aria-hidden />{hud.meds.firstaid}·{hud.meds.bandage}·{hud.meds.adrenaline}·{hud.meds.splint}</span>
                <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', hud.selfRevive ? 'bg-emerald-700/80 text-white' : 'bg-black/55 text-zinc-500')} title={hud.selfRevive ? 'Self-revive ready' : 'No self-revive'}><HeartPulse className="h-3 w-3" aria-hidden /><span className="sr-only">{hud.selfRevive ? 'Self-revive ready' : 'No self-revive'}</span></span>
                {hud.bleeding && <span className="inline-flex items-center gap-0.5 rounded bg-red-600/80 px-1.5 py-0.5 text-white"><Droplets className="h-3 w-3" aria-hidden />Bleeding · 8</span>}
                {hud.fracture && <span className="inline-flex items-center gap-0.5 rounded bg-orange-600/80 px-1.5 py-0.5 text-white"><Bone className="h-3 w-3" aria-hidden />Fracture · 6</span>}
                {hud.adrenaline > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/80 px-1.5 py-0.5 text-amber-950"><Syringe className="h-3 w-3" aria-hidden />{hud.adrenaline}s</span>}
                {hud.nvg && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600/80 px-1.5 py-0.5 text-white"><Eye className="h-3 w-3" aria-hidden />NVG</span>}
                {hud.hidden && <span className="rounded bg-lime-700/80 px-1.5 py-0.5 text-white">Concealed</span>}
                {hud.heavy && <span className="rounded bg-zinc-600/80 px-1.5 py-0.5 text-white">Overweight</span>}
              </div>
            </div>

            {/* Bottom right: the weapon card (outline, name and rarity, ammo, fire mode, equipment, killstreak) */}
            {hud.gun && !hud.vehicle && (
              <div className="pointer-events-none absolute bottom-4 end-4 w-72 text-end [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[10.5rem] [@media(pointer:coarse)]:end-3 [@media(pointer:coarse)]:w-36">
                <div className="flex items-end justify-end gap-3">
                  <GunSilhouette cls={hud.gun.cls} className="h-9 w-28 text-white/85 drop-shadow [@media(pointer:coarse)]:hidden" />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase tracking-widest" style={{ color: RC(hud.gun.rarity) }}>{RARITY[hud.gun.rarity].name}</p>
                    <p className="truncate text-sm font-black text-white drop-shadow">{hud.gun.name}</p>
                  </div>
                </div>
                <div className="mt-1 h-1 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${RC(hud.gun.rarity)})` }} />
                <p className="mt-0.5 font-black tabular-nums leading-none text-white drop-shadow"><span className={cn('text-5xl [@media(pointer:coarse)]:text-3xl', hud.gun.mag === 0 ? 'text-red-400' : hud.gun.mag <= hud.gun.magMax * 0.25 && 'text-amber-300')}>{hud.gun.mag}</span><span className="text-lg text-zinc-300"> / {hud.gun.reserve}</span></p>
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                  <span className="inline-flex overflow-hidden rounded ring-1 ring-white/20">{hud.gun.modes.map((m) => <span key={m} className={cn('px-1.5 py-0.5 text-[11px] font-black uppercase', m === hud.gun!.mode ? 'bg-white text-zinc-900' : 'bg-black/50 text-zinc-300 [@media(pointer:coarse)]:hidden')}>{m === 'auto' ? 'Auto' : m === 'burst' ? 'Burst' : 'Semi'}</span>)}</span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-black text-zinc-100" title="Frag grenades (G)"><Bomb className="h-3 w-3 text-amber-300" aria-hidden />{hud.frags}</span>
                  <span className="inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-black text-zinc-100" title="Flashbangs and smoke (V)">{hud.flashes ? <Zap className="h-3 w-3 text-sky-200" aria-hidden /> : <Cloud className="h-3 w-3 text-zinc-300" aria-hidden />}{hud.flashes + hud.smokes}</span>
                  <span className={cn('inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-black [@media(pointer:coarse)]:hidden', hud.support.have.length ? 'bg-red-600/85 text-white' : 'bg-black/55 text-zinc-400')} title="Killstreak (5)">
                    {hud.support.have[0] === 'airstrike' ? <Plane className="h-3 w-3" aria-hidden /> : <Radar className="h-3 w-3" aria-hidden />}
                    {hud.support.have.length ? `5 · ${hud.support.have[0] === 'airstrike' ? 'Airstrike' : 'UAV'}` : `${hud.support.streak}/${hud.support.streak < 3 ? 3 : 5}`}
                  </span>
                </div>
                <p className="mt-1 flex justify-end gap-1 [@media(pointer:coarse)]:hidden">{hud.slots.map((s, i) => <span key={i} className={cn('max-w-[5.5rem] truncate rounded px-1.5 py-0.5 text-[11px] font-bold', i === hud.slot ? 'bg-white/90 text-zinc-900' : 'bg-black/50 text-zinc-300')} style={i !== hud.slot ? { color: RC(s.rarity) } : undefined}>{i + 1} {s.name}</span>)}</p>
              </div>
            )}

            {/* Vehicle gauges */}
            {hud.vehicle && (
              <div className="pointer-events-none absolute bottom-4 end-4 rounded-xl bg-black/60 px-4 py-2 text-end ring-1 ring-white/15">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400"><Car className="me-1 inline h-3 w-3" aria-hidden />{hud.vehicle.kind === 'ltv' ? 'Armoured truck' : hud.vehicle.kind === 'bike' ? 'Dirt bike' : 'Boat'}</p>
                <p className="text-3xl font-black tabular-nums text-white">{hud.vehicle.speed}<span className="text-xs text-zinc-400"> km/h</span></p>
                <p className="flex items-center justify-end gap-1 text-[10px] font-bold text-zinc-300"><Fuel className="h-3 w-3" aria-hidden /><span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><span className={cn('block h-full origin-left', hud.vehicle.fuel < 0.2 ? 'bg-red-500' : 'bg-amber-300')} style={{ transform: `scaleX(${hud.vehicle.fuel})` }} /></span>{hud.vehicle.flat > 0 && <span className="text-red-300">· {hud.vehicle.flat} flat</span>}</p>
                <p className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full origin-left bg-emerald-400" style={{ transform: `scaleX(${hud.vehicle.hp})` }} /></p>
              </div>
            )}
          </>
        )}

        {/* Top right: the minimap, the time, money */}
        {hud && phase !== 'safehouse' && (
          <div className="pointer-events-none absolute end-3 top-3 flex flex-col items-end gap-1">
            <button type="button" onClick={() => game.current?.openMap()} className="pointer-events-auto relative block h-24 w-24 overflow-hidden rounded-full sm:h-36 sm:w-36" aria-label="Open the map (M)">
              <canvas ref={mini} width={288} height={288} className="h-full w-full" />
            </button>
            <p className="flex items-center gap-1.5 rounded bg-black/55 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-200">
              {hud.hour > 20.4 ? <Moon className="h-3 w-3" aria-hidden /> : <Timer className="h-3 w-3" aria-hidden />}{String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}
              {hud.rain && <CloudRain className="h-3 w-3 text-sky-300" aria-hidden />}
              {hud.uav > 0 && <span className="inline-flex items-center gap-0.5 text-red-300"><Radar className="h-3 w-3" aria-hidden />{hud.uav}s</span>}
            </p>
            <p className="rounded bg-black/55 px-2 py-0.5 text-[10px] font-black tabular-nums text-lime-300">${hud.cash.toLocaleString()} <span className="text-amber-200">· ${hud.fresh.toLocaleString()} to bank</span></p>
          </div>
        )}

        {/* Feed: the radio, kills, loot */}
        {inRaid && (
          <div className="pointer-events-none absolute start-3 top-1/3 flex w-64 flex-col gap-1 [@media(pointer:coarse)]:top-[38%]" aria-live="polite">
            {feed.map((f) => (
              <p key={f.id} className={cn('ops-feed w-fit max-w-full rounded-md px-2 py-0.5 text-[11px] font-bold', f.kind === 'radio' ? 'bg-emerald-950/70 text-emerald-200' : f.kind === 'bad' ? 'bg-red-950/70 text-red-200' : 'bg-black/55 text-zinc-100')} style={f.color ? { color: f.color } : undefined}>
                {f.kind === 'radio' && <Radio className="me-1 inline h-3 w-3" aria-hidden />}{f.text}
              </p>
            ))}
          </div>
        )}
        {/* Extraction countdown */}
        {hud?.extract && (
          <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-rose-300">{hud.extract.state === 'called' ? 'Extraction inbound' : hud.extract.state === 'landing' ? 'Helicopter landing' : 'Board the helicopter'}</p>
            {hud.extract.state === 'called' && <p className="text-4xl font-black tabular-nums text-white drop-shadow">{hud.extract.left}</p>}
          </div>
        )}
        {banner && (
          <div key={banner.id} className="ops-banner pointer-events-none absolute inset-x-0 top-[22%] text-center">
            <p className={cn('text-2xl font-black uppercase tracking-[0.12em] drop-shadow sm:text-4xl', banner.tone === 'gold' ? 'text-amber-300' : banner.tone === 'good' ? 'text-lime-300' : banner.tone === 'bad' ? 'text-red-400' : 'text-white')}>{banner.title}</p>
            {banner.sub && <p className="mt-1 text-xs font-bold uppercase tracking-[0.25em] text-zinc-200">{banner.sub}</p>}
          </div>
        )}

        {/* F1 for the controls (top left), and how to take the mouse when it's free */}
        {inRaid && (
          <button type="button" onClick={() => setHelp(true)} className="absolute start-3 top-3 hidden items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[11px] font-bold text-zinc-100 ring-1 ring-white/15 hover:bg-black/70 [@media(pointer:fine)]:inline-flex">
            <Keyboard className="h-3.5 w-3.5" aria-hidden />F1 · Controls
          </button>
        )}
        {inRaid && !locked && !menu && !help && (
          <p className="pointer-events-none absolute left-1/2 top-[40%] hidden -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 [@media(pointer:fine)]:flex">
            <MousePointer2 className="h-3.5 w-3.5" aria-hidden />Click to look around
          </p>
        )}
        {help && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Controls">
            <div className="ops-map-in w-full max-w-3xl rounded-2xl bg-zinc-950/95 p-5 ring-1 ring-white/10">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase tracking-[0.25em] text-lime-300">Controls</p>
                <button type="button" onClick={() => setHelp(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close the controls"><X className="h-4 w-4" aria-hidden /></button>
              </div>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {CONTROLS.map(([group, rows]) => (
                  <div key={group}>
                    <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">{group}</p>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      {rows.map(([k, v]) => <div key={k} className="flex items-baseline gap-2"><dt className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono font-bold text-white">{k}</dt><dd className="text-zinc-300">{v}</dd></div>)}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-400">F1 or Esc closes this.</p>
            </div>
          </div>
        )}

        {/* Menus */}
        {phase === 'safehouse' && !menu && <SafehouseMenu lzs={lzs} bigMap={big} onDeploy={(i) => game.current?.deploy(i)} onRange={() => game.current?.toRange()} />}
        {menu?.kind === 'summary' && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4">
            <div className="ops-map-in w-full max-w-sm rounded-2xl bg-zinc-950/90 p-5 text-center ring-1 ring-white/10">
              <p className="text-3xl font-black uppercase tracking-[0.2em] text-lime-300">{menu.title}</p>
              <dl className="mt-4 space-y-1.5 text-sm">{menu.lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-zinc-400">{k}</dt><dd className="font-black text-white">{v}</dd></div>)}</dl>
              <button type="button" onClick={close} className="mt-5 w-full rounded-xl bg-lime-400 py-2.5 text-sm font-black uppercase text-lime-950 hover:bg-lime-300">Back to the safehouse</button>
            </div>
          </div>
        )}
        {menu?.kind === 'down' && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-red-950/45 backdrop-grayscale">
            <div className="text-center">
              <p className="text-5xl font-black uppercase tracking-[0.15em] text-white">You’re down</p>
              <p className="mt-2 text-sm font-bold text-red-100">{menu.selfRevive ? 'Press F to use your self-revive kit' : menu.lost > 0 ? `$${menu.lost.toLocaleString()} of loot left with your body · the secure container comes home` : 'Your gear stays where you fell'}</p>
            </div>
          </div>
        )}
        {menu?.kind === 'inventory' && <InventoryMenu menu={menu} onClose={close} onTake={(i) => game.current?.take(i)} onAction={(a) => game.current?.invAction(a)} />}
        {menu?.kind === 'buy' && <BuyMenu cash={menu.cash} onBuy={(id) => game.current?.buy(id)} onClose={close} />}
        {menu?.kind === 'map' && <MapMenu mortar={menu.mortar} bigMap={big} onPick={(x, z) => game.current?.mapPick(x, z)} onClose={close} />}
        {phase === 'insert' && <p className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center text-xs font-bold uppercase tracking-[0.3em] text-zinc-200"><Activity className="me-1 inline h-3.5 w-3.5" aria-hidden />Inbound · look around with the mouse</p>}
        {phase === 'exfil' && <p className="pointer-events-none absolute inset-x-0 bottom-[12%] text-center text-xs font-bold uppercase tracking-[0.3em] text-lime-200">Exfiltrating</p>}
      </WorldFrame>
      <p className="mt-2 text-center text-xs text-zinc-400">{GAMES.ops.how}</p>
    </div>
  );
}
