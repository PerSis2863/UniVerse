'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Small shared parts for Create's fourth set of tools (M74).

export const BRANCH = ['#533ff6', '#ec74ce', '#0d9488', '#d97706', '#2563eb', '#dc2626', '#7c3aed', '#059669'];
export const nf = (n: number, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : '—');
export const ask = (msg: string, go: () => void) => { if (window.confirm(msg)) go(); };
/** A crypto-random whole number in [0, n). */
export const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
export const MONEY = ['₹', '$', '€', '£', '¥', '₦', 'R', 'KSh '];

export const Stat = ({ k, v, big }: { k: string; v: React.ReactNode; big?: boolean }) => (
  <div className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{k}</dt><dd className={cn('font-mono tabular-nums text-zinc-900 dark:text-white', big && 'text-xl font-bold')}>{v}</dd></div>
);

/** A box that can fill the screen (for showing a class): the browser's full screen, or the page if refused. */
export function useFull<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [full, setFull] = useState(false);
  useEffect(() => { const h = () => { if (!document.fullscreenElement) setFull(false); }; document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  const toggle = async () => {
    if (full) { setFull(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    setFull(true);
    await ref.current?.requestFullscreen?.().catch(() => {});
  };
  return { ref, full, toggle, boxClass: full ? 'fixed inset-0 z-[80] overflow-auto bg-white dark:bg-[#0a0f2b] p-6 sm:p-10' : '' };
}

export const FullBtn = ({ full, onClick, className }: { full: boolean; onClick: () => void; className?: string }) => (
  <button type="button" onClick={onClick} className={cn('btn-secondary btn-sm', className)}>{full ? <Minimize2 className="w-3.5 h-3.5" aria-hidden /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden />}{full ? 'Close full screen' : 'Full screen'}</button>
);

/** Tabs inside a tool, in the app's segmented style. */
export function Segments<T extends string>({ value, options, onChange, label }: { value: NoInfer<T>; options: readonly (readonly [T, string])[]; onChange: (v: NoInfer<T>) => void; label: string }) {
  return (
    <div className="ios-segmented" role="tablist" aria-label={label}>
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cn('ios-segment', value === k && 'font-bold')}>{value === k && <span className="ios-segment-thumb" aria-hidden />}{l}</button>)}
    </div>
  );
}
