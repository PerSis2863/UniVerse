'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bone, Car, CloudRain, Droplets, Eye, Fuel, Heart, Moon, Radar, Radio, Syringe, Timer } from 'lucide-react';
import { GAMES } from '@/lib/play';
import { MAP_SIZE, RARITY, opsMap } from '@/lib/play/ops';
import { cn } from '@/lib/utils';
import type { GameProps } from '../game-props';
import { WorldFrame } from '../world/Stage';
import type { Controls } from '../world/core';
import { OpsGame } from './game';
import { compassPlaces } from './hud-draw';
import { BuyMenu, InventoryMenu, MapMenu, SafehouseMenu } from './menus';
import type { Banner, FeedLine, HitKind, HudState, Menu } from './types';

// Ridgeline Ops on screen (rules: src/lib/play/ops; the game: ./game.ts). The canvas, the tactical
// HUD (a degree compass with place markers, a minimap that turns with you, health with three armour
// plates and status icons, the gun with its rarity, magazine and fire mode, hitmarkers, a red arc
// toward whoever hit you, prompts, the radio and kill feed, banners, the extraction countdown, the
// vehicle's gauges) and the menus. The game draws the parts that change every frame straight onto
// the page; React re-renders at most ten times a second and only when something changed.

const RC = (r: number) => RARITY[r]?.color ?? '#a1a1aa';
const DIRS: [string, number][] = [['N', 0], ['15', 15], ['30', 30], ['NE', 45], ['60', 60], ['75', 75], ['E', 90], ['105', 105], ['120', 120], ['SE', 135], ['150', 150], ['165', 165], ['S', 180], ['195', 195], ['210', 210], ['SW', 225], ['240', 240], ['255', 255], ['W', 270], ['285', 285], ['300', 300], ['NW', 315], ['330', 330], ['345', 345]];
const PHONE_BUTTONS = [{ id: 'inv', label: 'Bag' }, { id: 'nvg', label: 'NVG' }, { id: 'plate', label: 'Plate' }, { id: 'heal', label: 'Med' }, { id: 'throw', label: 'Nade' }, { id: 'swap', label: 'Swap' }, { id: 'crouch', label: 'Crouch' }, { id: 'act', label: 'Use' }, { id: 'skill', label: 'Reload' }, { id: 'jump', label: 'Jump' }, { id: 'aim', label: 'Aim' }, { id: 'fire', label: 'Fire' }] as const;

export function RidgelineOps({ seed, endsAt, clock, onProgress, onStats, net }: GameProps) {
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
      <WorldFrame net={net} canvas={canvas} controls={controls} buttons={PHONE_BUTTONS.map((b) => ({ ...b }))} className="h-[min(86vh,900px)]"
        keys="WASD · Shift sprint (×2 tactical) · C crouch/slide · Z prone · Space jump/vault · Q/E lean · F use · R reload · B fire mode · 4 plate · H/5/6/7 meds · G/V grenades · N night vision · Tab bag · M map · Y rain"
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
            {hit.n > 0 && <span key={hit.n} className={cn('ops-hit pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2', hit.kind === 'kill' || hit.kind === 'head' ? 'ops-kill text-red-500' : hit.kind === 'armour' || hit.kind === 'break' ? 'text-sky-400' : 'text-white')} aria-hidden>{hit.kind === 'break' && <span className="ops-crack absolute inset-0" />}</span>}
            {hurt.map((h) => <span key={h.n} className="ops-dir pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" style={{ '--a': `${h.a}deg` } as React.CSSProperties} aria-hidden />)}
            {hud.hp < 35 && <span className="ops-low pointer-events-none absolute inset-0" aria-hidden />}
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

            {/* Bottom left: health, three plates, kit, what's wrong */}
            <div className="pointer-events-none absolute bottom-3 start-3 w-44 space-y-1 sm:w-56 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[5.75rem] [@media(pointer:coarse)]:w-40">
              <div className="flex gap-1">
                {Array.from({ length: Math.max(3, hud.plateMax) }, (_, i) => (
                  <span key={i} className={cn('h-2 flex-1 overflow-hidden rounded-sm bg-white/10 ring-1', i < hud.plateMax ? 'ring-white/10' : 'opacity-25 ring-transparent')}>
                    <span className="block h-full origin-left bg-gradient-to-r from-violet-500 to-sky-400 transition-transform duration-200 rtl:origin-right" style={{ transform: `scaleX(${Math.min(1, (hud.plates[i] ?? 0) / 75)})` }} />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className={cn('h-3.5 w-3.5', hud.hp < 35 ? 'text-red-400' : 'text-zinc-200')} aria-hidden />
                <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-black/50 ring-1 ring-white/10"><div className={cn('h-full origin-left transition-transform duration-200 rtl:origin-right', hud.hp < 35 ? 'bg-red-500' : 'bg-zinc-100')} style={{ transform: `scaleX(${hud.hp / 100})` }} /></div>
                <span className="w-7 text-end text-[11px] font-black tabular-nums text-white">{hud.hp}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full origin-left bg-amber-200/80" style={{ transform: `scaleX(${hud.stamina / 100})` }} /></div>
              <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold text-zinc-200">
                <span className="rounded bg-black/55 px-1.5 py-0.5">▣ {hud.spares}</span>
                <span className="rounded bg-black/55 px-1.5 py-0.5" title="First aid / bandage / adrenaline / splint">✚ {hud.meds.firstaid}·{hud.meds.bandage}·{hud.meds.adrenaline}·{hud.meds.splint}</span>
                {hud.bleeding && <span className="inline-flex items-center gap-0.5 rounded bg-red-600/80 px-1.5 py-0.5 text-white"><Droplets className="h-3 w-3" aria-hidden />Bleeding · 5</span>}
                {hud.fracture && <span className="inline-flex items-center gap-0.5 rounded bg-orange-600/80 px-1.5 py-0.5 text-white"><Bone className="h-3 w-3" aria-hidden />Fracture · 6</span>}
                {hud.adrenaline > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/80 px-1.5 py-0.5 text-amber-950"><Syringe className="h-3 w-3" aria-hidden />{hud.adrenaline}s</span>}
                {hud.nvg && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600/80 px-1.5 py-0.5 text-white"><Eye className="h-3 w-3" aria-hidden />NVG</span>}
                {hud.hidden && <span className="rounded bg-lime-700/80 px-1.5 py-0.5 text-white">Concealed</span>}
                {hud.heavy && <span className="rounded bg-zinc-600/80 px-1.5 py-0.5 text-white">Overweight</span>}
              </div>
            </div>

            {/* Bottom right: the gun */}
            {hud.gun && !hud.vehicle && (
              <div className="pointer-events-none absolute bottom-3 end-3 w-48 text-end sm:w-60 [@media(pointer:coarse)]:bottom-auto [@media(pointer:coarse)]:top-[10.5rem] [@media(pointer:coarse)]:w-36">
                <p className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: RC(hud.gun.rarity) }}>{RARITY[hud.gun.rarity].name} · {hud.gun.cls}</p>
                <p className="truncate text-sm font-black text-white drop-shadow">{hud.gun.name}</p>
                <p className="font-black tabular-nums text-white drop-shadow"><span className={cn('text-3xl', hud.gun.mag === 0 ? 'text-red-400' : hud.gun.mag <= hud.gun.magMax * 0.25 && 'text-amber-300')}>{hud.gun.mag}</span><span className="text-sm text-zinc-400"> / {hud.gun.reserve}</span></p>
                <p className="mt-0.5 flex justify-end gap-1">{hud.gun.modes.map((m) => <span key={m} className={cn('rounded px-1 text-[9px] font-black uppercase', m === hud.gun!.mode ? 'bg-white text-zinc-900' : 'bg-white/15 text-zinc-300')}>{m === 'auto' ? 'Auto' : m === 'burst' ? 'Burst' : 'Semi'}</span>)}<span className="ms-1 whitespace-nowrap rounded bg-black/55 px-1 text-[9px] font-black text-zinc-200">G {hud.frags} · V {hud.flashes}</span></p>
                <p className="mt-1 flex justify-end gap-1 [@media(pointer:coarse)]:hidden">{hud.slots.map((s, i) => <span key={i} className={cn('max-w-[5.5rem] truncate rounded px-1.5 py-0.5 text-[9px] font-bold', i === hud.slot ? 'bg-white/90 text-zinc-900' : 'bg-black/50 text-zinc-300')} style={i !== hud.slot ? { color: RC(s.rarity) } : undefined}>{i + 1} {s.name}</span>)}</p>
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
