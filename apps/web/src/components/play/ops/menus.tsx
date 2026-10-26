'use client';

import { useState } from 'react';
import { Backpack, Crosshair, MapPin, ScrollText, ShieldCheck, ShoppingCart, Target, Wrench, X } from 'lucide-react';
import {
  AMMO, ATTACHMENTS, BUY, CONTRACTS, HELMETS, MEDS, NADES, PACKS, PLATES, RARITY, SECURE_SLOTS, SHELF, SLOTS, SLOT_NAMES, VESTS, WEAPONS,
  bagAdd, fits, gunBars, weaponBase, gunStats, itemName, itemRarity, itemValue, itemWeight, makeGun, sellPrice, starterLoadout,
  type AttId, type BuyId, type Gun, type Item, type Loadout, type Slot,
} from '@/lib/play/ops';
import { cn } from '@/lib/utils';
import { loadSafehouse, saveSafehouse, STASH_SLOTS, type Safehouse } from './stash';
import type { Menu } from './types';

// The menus of Ridgeline Ops: the safehouse between raids (loadout and stash, the trader, contracts,
// the range, and the deploy map), the in-raid inventory with what's being looted and the gunsmith,
// the buy station, the down screen and the extraction summary. Dark, dense, military; every action
// is a button (works with a mouse, a finger or the keyboard).

const rc = (r: number) => RARITY[r]?.color ?? '#a1a1aa';
const panel = 'rounded-2xl bg-zinc-950/88 ring-1 ring-white/10 backdrop-blur-sm';
const chip = 'rounded-md bg-white/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300';

function ItemRow({ it, actions }: { it: Item; actions: { label: string; on: () => void; tone?: 'buy' | 'sell' }[] }) {
  const r = itemRarity(it);
  return (
    <div className="group flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 ring-1 ring-white/5" style={{ boxShadow: `inset 3px 0 0 ${rc(r)}` }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-zinc-100">{itemName(it)}{'fresh' in it && it.fresh && <span className="ms-1.5 text-[9px] font-black uppercase text-amber-300">new</span>}</p>
        <p className="text-[10px] text-zinc-500">{RARITY[r].name} · ${itemValue(it).toLocaleString()} · {itemWeight(it).toFixed(1)} kg</p>
      </div>
      {actions.map((a) => <button key={a.label} type="button" onClick={a.on} className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide transition-colors', a.tone === 'buy' ? 'bg-lime-400 text-lime-950 hover:bg-lime-300' : a.tone === 'sell' ? 'bg-amber-400/90 text-amber-950 hover:bg-amber-300' : 'bg-white/10 text-zinc-100 hover:bg-white/20')}>{a.label}</button>)}
    </div>
  );
}

function GunCard({ gun, label, children }: { gun: Gun | null; label: string; children?: React.ReactNode }) {
  const s = gun ? gunStats(gun) : null;
  return (
    <div className={cn(panel, 'p-3')} style={gun ? { boxShadow: `inset 0 0 0 1px ${rc(gun.rarity)}55` } : undefined}>
      <p className={chip}>{label}</p>
      {gun && s ? (
        <>
          <p className="mt-1.5 text-sm font-black" style={{ color: rc(gun.rarity) }}>{s.name}</p>
          <p className="text-[10px] text-zinc-500">{RARITY[gun.rarity].name} · {s.cls.toUpperCase()} · {s.mag} rds · {WEAPONS[gun.base].modes.join(' / ')}</p>
          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
            {Object.entries(gunBars(s)).map(([k, v]) => (
              <div key={k}><p className="text-[9px] uppercase text-zinc-500">{k}</p><div className="h-1 rounded-full bg-white/10"><div className="h-full origin-left rounded-full bg-zinc-200" style={{ transform: `scaleX(${v / 100})` }} /></div></div>
            ))}
          </div>
          {children}
        </>
      ) : <p className="mt-2 text-xs text-zinc-500">Empty</p>}
    </div>
  );
}

/* ── The safehouse ── */
type Tab = 'deploy' | 'loadout' | 'trader' | 'contracts';
const TRADER: { it: Item; price: number }[] = [
  ...SHELF.map((w) => ({ it: { kind: 'gun', gun: makeGun(w, 0, () => 0.5) } as Item, price: Math.round(WEAPONS[w].value * 1.3) })),
  ...(Object.keys(ATTACHMENTS) as AttId[]).filter((a) => a !== 'fmj').map((a) => ({ it: { kind: 'att', att: a } as Item, price: Math.round(ATTACHMENTS[a].value * 1.3) })),
  ...([1, 2, 3] as const).map((t) => ({ it: { kind: 'helmet', tier: t } as Item, price: Math.round(HELMETS[t].value * 1.3) })),
  ...([1, 2, 3] as const).map((t) => ({ it: { kind: 'vest', tier: t } as Item, price: Math.round(VESTS[t].value * 1.3) })),
  ...(['medium', 'large'] as const).map((s) => ({ it: { kind: 'pack', size: s } as Item, price: Math.round(PACKS[s].value * 1.3) })),
  ...(Object.keys(MEDS) as (keyof typeof MEDS)[]).map((m) => ({ it: { kind: 'med', med: m, n: 1 } as Item, price: Math.round(MEDS[m].value * 1.2) })),
  { it: { kind: 'plate', plate: 'ceramic', n: 2 }, price: PLATES.ceramic.value * 2 }, { it: { kind: 'plate', plate: 'steel', n: 1 }, price: PLATES.steel.value },
  ...(Object.keys(AMMO) as (keyof typeof AMMO)[]).map((p) => ({ it: { kind: 'ammo', pool: p, n: Math.round(AMMO[p].stack / 2) } as Item, price: Math.round(AMMO[p].value * AMMO[p].stack * 0.6) + 20 })),
  ...(Object.keys(NADES) as (keyof typeof NADES)[]).map((n) => ({ it: { kind: 'nade', nade: n, n: 1 } as Item, price: NADES[n].value })),
];

export function SafehouseMenu({ lzs, onDeploy, onRange, bigMap }: { lzs: { name: string; x: number; y: number }[]; onDeploy: (i: number) => void; onRange: () => void; bigMap: React.RefObject<HTMLCanvasElement | null> }) {
  const [tab, setTab] = useState<Tab>('deploy');
  const [s, setS] = useState<Safehouse>(() => loadSafehouse());
  const kit: Loadout = s.loadout ?? starterLoadout();
  const commit = (next: Safehouse) => { saveSafehouse(next); setS({ ...next }); };
  const edit = (fn: (n: Safehouse, l: Loadout) => void) => { const n: Safehouse = structuredClone(s); const l = n.loadout ?? starterLoadout(); fn(n, l); n.loadout = l; commit(n); };
  const toStash = (n: Safehouse, it: Item) => { if (n.stash.length < STASH_SLOTS) n.stash.push(it); };
  // Equip a stash item onto the kit (what it replaces goes back to the stash).
  const equip = (i: number, slot?: number) => edit((n, l) => {
    const [it] = n.stash.splice(i, 1);
    if (!it) return;
    if (it.kind === 'gun') {
      const pistol = WEAPONS[it.gun.base].cls === 'pistol', at = pistol ? 2 : slot ?? (l.primary[0] ? 1 : 0);
      const old = at === 2 ? l.sidearm : l.primary[at];
      if (at === 2) l.sidearm = it.gun; else l.primary[at] = it.gun;
      if (old) toStash(n, { kind: 'gun', gun: old });
    } else if (it.kind === 'helmet') { if (l.helmet) toStash(n, { kind: 'helmet', tier: l.helmet }); l.helmet = it.tier; }
    else if (it.kind === 'vest') { if (l.vest) toStash(n, { kind: 'vest', tier: l.vest }); l.vest = it.tier; l.plates = Array.from({ length: VESTS[it.tier].plates }, (_, k) => l.plates[k] ?? 0); }
    else if (it.kind === 'pack') { toStash(n, { kind: 'pack', size: l.pack }); l.pack = it.size; }
    else if (bagAdd(l, it)) toStash(n, it);
  });
  const unequip = (where: 'p0' | 'p1' | 'side' | 'bag', i = 0) => edit((n, l) => {
    if (where === 'p0' && l.primary[0]) { toStash(n, { kind: 'gun', gun: l.primary[0] }); l.primary[0] = null; }
    if (where === 'p1' && l.primary[1]) { toStash(n, { kind: 'gun', gun: l.primary[1] }); l.primary[1] = null; }
    if (where === 'side' && l.sidearm) { toStash(n, { kind: 'gun', gun: l.sidearm }); l.sidearm = null; }
    if (where === 'bag') { const [it] = l.bag.splice(i, 1); if (it) toStash(n, it); }
  });
  const attachFromStash = (i: number, at: number) => edit((n, l) => {
    const it = n.stash[i], g = at === 2 ? l.sidearm : l.primary[at];
    if (!g || it?.kind !== 'att' || !fits(it.att, g.base)) return;
    n.stash.splice(i, 1);
    const slot = ATTACHMENTS[it.att].slot as Slot, old = g.att[slot];
    g.att[slot] = it.att; if (old) toStash(n, { kind: 'att', att: old });
    g.mag = gunStats(g).mag;
  });
  const buy = (k: number) => { const row = TRADER[k]; if (s.cash < row.price) return; const n = structuredClone(s); n.cash -= row.price; toStash(n, structuredClone(row.it)); commit(n); };
  const sell = (i: number) => { const n = structuredClone(s); const [it] = n.stash.splice(i, 1); if (it) n.cash += sellPrice(it); commit(n); };
  const accept = (id: string) => { const n = structuredClone(s); if (n.contracts.filter((c) => !c.done).length < 3 && !n.contracts.some((c) => c.id === id && !c.done)) { n.contracts = [...n.contracts.filter((c) => c.id !== id), { id, progress: 0, done: false }]; commit(n); } };
  const tabs: [Tab, string, typeof MapPin][] = [['deploy', 'Deploy', MapPin], ['loadout', 'Loadout & stash', Backpack], ['trader', 'Black market', ShoppingCart], ['contracts', 'Contracts', ScrollText]];

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gradient-to-b from-black/80 via-black/70 to-black/85 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm font-black uppercase tracking-[0.3em] text-lime-300">Safehouse</p>
        <span className={chip}>${s.cash.toLocaleString()}</span>
        <span className={chip}>Raids {s.raids} · out {s.extracts}</span>
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto">
        {tabs.map(([k, label, Icon]) => <button key={k} type="button" onClick={() => setTab(k)} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors', tab === k ? 'bg-lime-400 text-lime-950' : 'bg-white/8 text-zinc-200 hover:bg-white/15')}><Icon className="h-3.5 w-3.5" aria-hidden />{label}</button>)}
        <button type="button" onClick={onRange} className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-xs font-black uppercase tracking-wide text-zinc-200 hover:bg-white/15"><Target className="h-3.5 w-3.5" aria-hidden />Firing range</button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'deploy' && (
          <div className="mx-auto max-w-[min(92vw,560px)]">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl ring-2 ring-white/15">
              <canvas ref={bigMap} width={720} height={720} className="h-full w-full" />
              {lzs.map((p, i) => (
                <button key={p.name} type="button" onClick={() => onDeploy(i)} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 px-2.5 py-1 text-[11px] font-black text-amber-950 shadow-lg ring-2 ring-black/40 transition-transform duration-150 hover:scale-110 active:scale-95" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                  {i + 1} · {p.name.replace('LZ ', '')}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-400">Pick a landing zone. Red: held by the enemy · orange: hostages · white: your lost gear. Kit: {kit.primary[0] ? WEAPONS[kit.primary[0].base].name : 'no rifle'}, {kit.sidearm ? WEAPONS[kit.sidearm.base].name : 'no sidearm'}, {kit.vest ? `T${kit.vest} vest` : 'no vest'}.</p>
          </div>
        )}
        {tab === 'loadout' && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              {([['Primary 1', 0, 'p0'], ['Primary 2', 1, 'p1'], ['Sidearm', 2, 'side']] as const).map(([label, at, key]) => (
                <GunCard key={label} label={label} gun={at === 2 ? kit.sidearm : kit.primary[at]}>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SLOTS.map((sl) => { const g = at === 2 ? kit.sidearm : kit.primary[at], a = g?.att[sl]; return <span key={sl} className={cn(chip, a && 'text-zinc-100')}>{SLOT_NAMES[sl]}: {a ? ATTACHMENTS[a].name : '—'}</span>; })}
                    <button type="button" onClick={() => unequip(key)} className="ms-auto rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-200 hover:bg-white/20">To stash</button>
                  </div>
                </GunCard>
              ))}
              <div className={cn(panel, 'p-3')}>
                <p className={chip}>Kit</p>
                <p className="mt-1.5 text-xs text-zinc-300">{kit.helmet ? `${HELMETS[kit.helmet].name} (T${kit.helmet})` : 'No helmet'} · {kit.vest ? `${VESTS[kit.vest].name} (T${kit.vest}, ${VESTS[kit.vest].plates} plates)` : 'No vest'} · {PACKS[kit.pack].name} ({PACKS[kit.pack].slots} slots)</p>
                <div className="mt-2 space-y-1">{kit.bag.map((it, i) => <ItemRow key={i} it={it} actions={[{ label: 'Stash', on: () => unequip('bag', i) }]} />)}</div>
              </div>
            </div>
            <div className={cn(panel, 'p-3')}>
              <p className={chip}>Stash · {s.stash.length}/{STASH_SLOTS}</p>
              <div className="mt-2 space-y-1">
                {s.stash.length === 0 && <p className="text-xs text-zinc-500">Empty. What you extract with ends up here.</p>}
                {s.stash.map((it, i) => (
                  <ItemRow key={i} it={it} actions={[
                    ...(it.kind === 'att' ? ([0, 1, 2] as const).filter((at) => { const g = at === 2 ? kit.sidearm : kit.primary[at]; return g && fits(it.att, g.base); }).map((at) => ({ label: `On ${at === 2 ? 'sidearm' : `P${at + 1}`}`, on: () => attachFromStash(i, at) })) : []),
                    ...(it.kind === 'gun' && WEAPONS[it.gun.base].cls !== 'pistol' ? [{ label: 'P1', on: () => equip(i, 0) }, { label: 'P2', on: () => equip(i, 1) }] : it.kind !== 'att' ? [{ label: 'Equip', on: () => equip(i) }] : []),
                    { label: `Sell $${sellPrice(it).toLocaleString()}`, on: () => sell(i), tone: 'sell' as const },
                  ]} />
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'trader' && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {TRADER.map((row, k) => <ItemRow key={k} it={row.it} actions={[{ label: `$${row.price.toLocaleString()}`, on: () => buy(k), tone: 'buy' }]} />)}
          </div>
        )}
        {tab === 'contracts' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTRACTS.map((c) => {
              const mine = s.contracts.find((x) => x.id === c.id);
              return (
                <div key={c.id} className={cn(panel, 'p-3')}>
                  <p className="flex items-center gap-2 text-sm font-black text-zinc-100"><ShieldCheck className="h-4 w-4 text-lime-300" aria-hidden />{c.name}<span className="ms-auto text-xs text-lime-300">${c.pay.toLocaleString()}</span></p>
                  <p className="mt-1 text-xs text-zinc-400">{c.about}</p>
                  {mine && !mine.done ? (
                    <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full origin-left rounded-full bg-lime-400" style={{ transform: `scaleX(${Math.min(1, mine.progress / c.goal)})` }} /></div>
                  ) : mine?.done ? <p className="mt-2 text-[11px] font-bold text-lime-300">Done · paid</p> : <button type="button" onClick={() => accept(c.id)} className="mt-2 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-black uppercase text-zinc-100 hover:bg-white/20">Accept</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── In the raid ── */
export function InventoryMenu({ menu, onClose, onTake, onAction }: { menu: Extract<Menu, { kind: 'inventory' }>; onClose: () => void; onTake: (i: number) => void; onAction: (a: { do: 'drop' | 'use' | 'secure' | 'unsecure' | 'equip' | 'unequip' | 'attach' | 'detach'; index?: number; slot?: number; att?: string }) => void }) {
  const [tab, setTab] = useState<'bag' | 'gunsmith'>('bag');
  const [gs, setGs] = useState(0);
  const l = menu.loadout, guns = [l.primary[0], l.primary[1], l.sidearm], g = guns[gs];
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black/75 p-3 sm:p-5" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center gap-2">
        {(['bag', 'gunsmith'] as const).map((k) => <button key={k} type="button" onClick={() => setTab(k)} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wide', tab === k ? 'bg-lime-400 text-lime-950' : 'bg-white/8 text-zinc-200 hover:bg-white/15')}>{k === 'bag' ? <Backpack className="h-3.5 w-3.5" aria-hidden /> : <Wrench className="h-3.5 w-3.5" aria-hidden />}{k === 'bag' ? 'Inventory' : 'Gunsmith'}</button>)}
        <span className={cn(chip, 'ms-auto', menu.weight > menu.limit && 'text-red-300')}>{menu.weight.toFixed(1)} / {menu.limit} kg</span>
        <span className={chip}>${l.cash.toLocaleString()}</span>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Close (Tab)"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-3 grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-[1fr_1fr]">
        {tab === 'bag' ? (
          <>
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                {guns.map((gun, i) => (
                  <div key={i} className={cn(panel, 'p-2.5')} style={gun ? { boxShadow: `inset 0 0 0 1px ${rc(gun.rarity)}55` } : undefined}>
                    <p className={chip}>{i === 2 ? 'Sidearm' : `Primary ${i + 1}`}</p>
                    <p className="mt-1 truncate text-xs font-black" style={{ color: gun ? rc(gun.rarity) : '#71717a' }}>{gun ? gunStats(gun).name : 'Empty'}</p>
                    {gun && <button type="button" onClick={() => onAction({ do: 'unequip', slot: i })} className="mt-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-200 hover:bg-white/20">To bag</button>}
                  </div>
                ))}
              </div>
              <div className={cn(panel, 'p-2.5 text-xs text-zinc-300')}>
                <p className={chip}>Armour</p>
                <p className="mt-1">{l.helmet ? `${HELMETS[l.helmet].name} (T${l.helmet})` : 'No helmet'} · {l.vest ? `${VESTS[l.vest].name} (T${l.vest})` : 'No vest'}</p>
                <div className="mt-1.5 flex gap-1">{l.plates.map((p, i) => <span key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full origin-left bg-sky-400" style={{ transform: `scaleX(${p / 75})` }} /></span>)}</div>
              </div>
              <div className={cn(panel, 'p-2.5')}>
                <p className={chip}>{PACKS[l.pack].name} · {l.bag.length}/{PACKS[l.pack].slots}</p>
                <div className="mt-2 space-y-1">
                  {l.bag.map((it, i) => <ItemRow key={i} it={it} actions={[
                    ...(it.kind === 'med' || it.kind === 'plate' ? [{ label: 'Use', on: () => onAction({ do: 'use', index: i }) }] : []),
                    ...(it.kind === 'gun' ? [{ label: 'Equip', on: () => onAction({ do: 'equip', index: i }) }] : []),
                    ...(l.secure.length < SECURE_SLOTS ? [{ label: 'Secure', on: () => onAction({ do: 'secure', index: i }) }] : []),
                    { label: 'Drop', on: () => onAction({ do: 'drop', index: i }) },
                  ]} />)}
                </div>
              </div>
              <div className={cn(panel, 'p-2.5')}>
                <p className={chip}>Secure container · {l.secure.length}/{SECURE_SLOTS} · kept if you go down</p>
                <div className="mt-2 grid grid-cols-2 gap-1">{l.secure.map((it, i) => <ItemRow key={i} it={it} actions={[{ label: 'Out', on: () => onAction({ do: 'unsecure', index: i }) }]} />)}</div>
              </div>
            </div>
            <div className={cn(panel, 'p-2.5')}>
              <p className={chip}>{menu.loot ? menu.loot.title : 'Nothing to loot here'}</p>
              {!menu.loot && <p className="mt-3 px-1 text-xs leading-relaxed text-zinc-400">Walk up to a crate, a cabinet, a duffel bag, a safe or a fallen soldier and press F to search it: what&apos;s inside shows here. Locked safes need their key.</p>}
              {menu.loot && (
                <>
                  <div className="mt-2 space-y-1">
                    {menu.loot.items.length === 0 && <p className="text-xs text-zinc-500">Empty.</p>}
                    {menu.loot.items.map((it, i) => <ItemRow key={i} it={it} actions={[{ label: 'Take', on: () => onTake(i), tone: 'buy' }]} />)}
                  </div>
                  {menu.loot.items.length > 1 && <button type="button" onClick={() => onTake(-1)} className="mt-2 w-full rounded-lg bg-lime-400 py-2 text-xs font-black uppercase text-lime-950 hover:bg-lime-300">Take all</button>}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex gap-1.5">{guns.map((gun, i) => <button key={i} type="button" onClick={() => setGs(i)} className={cn('flex-1 truncate rounded-lg px-2 py-1.5 text-[11px] font-black', gs === i ? 'bg-white text-zinc-900' : 'bg-white/8 text-zinc-300')} style={gun && gs !== i ? { color: rc(gun.rarity) } : undefined}>{gun ? WEAPONS[gun.base].name : '—'}</button>)}</div>
              <GunCard gun={g} label="On the bench">
                {g && (
                  <div className="mt-3 space-y-1.5">
                    {SLOTS.map((sl) => (
                      <div key={sl} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5">
                        <span className="w-24 text-[10px] font-bold uppercase text-zinc-500">{SLOT_NAMES[sl]}</span>
                        <span className="flex-1 truncate text-xs text-zinc-100">{g.att[sl] ? ATTACHMENTS[g.att[sl]!].name : sl === 'optic' && weaponBase(g.base).optic ? `${ATTACHMENTS[weaponBase(g.base).optic!].name} (built in)` : '—'}</span>
                        {g.att[sl] && <button type="button" onClick={() => onAction({ do: 'detach', slot: gs, att: sl })} className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-200 hover:bg-white/20">Detach</button>}
                      </div>
                    ))}
                  </div>
                )}
              </GunCard>
            </div>
            <div className={cn(panel, 'p-2.5')}>
              <p className={chip}>Attachments in your bag</p>
              <div className="mt-2 space-y-1">
                {l.bag.map((it, i) => (it.kind === 'att' ? { it, i } : null)).filter((x): x is { it: Extract<Item, { kind: 'att' }>; i: number } => !!x).map(({ it, i }) => (
                  <ItemRow key={i} it={it} actions={g && fits(it.att, g.base) ? [{ label: 'Attach', on: () => onAction({ do: 'attach', index: i, slot: gs }), tone: 'buy' }] : [{ label: 'Doesn’t fit', on: () => {} }]} />
                ))}
                {!l.bag.some((it) => it.kind === 'att') && <p className="text-xs text-zinc-500">Find optics, suppressors, grips, magazines and special rounds in weapon crates and on soldiers.</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BuyMenu({ cash, onBuy, onClose }: { cash: number; onBuy: (id: BuyId) => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-3">
      <div className={cn(panel, 'w-full max-w-md p-4')}>
        <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-lime-300" aria-hidden /><p className="text-sm font-black uppercase tracking-widest text-lime-300">Buy station</p><span className={cn(chip, 'ms-auto')}>${cash.toLocaleString()}</span><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white" aria-label="Close"><X className="h-4 w-4" aria-hidden /></button></div>
        <div className="mt-3 space-y-1.5">
          {(Object.keys(BUY) as BuyId[]).map((id) => (
            <button key={id} type="button" disabled={cash < BUY[id].price} onClick={() => onBuy(id)} className="flex w-full items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2 text-start ring-1 ring-white/5 transition-colors hover:bg-white/10 disabled:opacity-40">
              <div className="min-w-0 flex-1"><p className="text-xs font-black text-zinc-100">{BUY[id].name}</p><p className="text-[10px] text-zinc-400">{BUY[id].about}</p></div>
              <span className="rounded-md bg-lime-400 px-2 py-1 text-[11px] font-black text-lime-950">${BUY[id].price.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MapMenu({ mortar, bigMap, onPick, onClose }: { mortar: boolean; bigMap: React.RefObject<HTMLCanvasElement | null>; onPick: (x: number, z: number) => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-3" onClick={() => !mortar && onClose()}>
      <div className="w-full max-w-[min(92vw,620px)]" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-center text-xs font-black uppercase tracking-[0.3em] text-zinc-200">{mortar ? <><Crosshair className="me-1 inline h-4 w-4 text-red-400" aria-hidden />Tap where the shells should land</> : 'Ridgeline · M to close'}</p>
        <canvas ref={bigMap} width={720} height={720} className={cn('aspect-square w-full rounded-2xl ring-2 ring-white/20', mortar && 'cursor-crosshair')}
          onClick={(e) => { if (!mortar) return; const r = e.currentTarget.getBoundingClientRect(); onPick(((e.clientX - r.left) / r.width - 0.5) * 800, ((e.clientY - r.top) / r.height - 0.5) * 800); }} />
      </div>
    </div>
  );
}
