'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EVERY_MS, record, textAt, type Replay } from './writing-replay';

// Keeps the writing replay of a typed answer while the student writes (Stage 5 · B3.6): a change
// every few seconds, and each paste on its own. Never each key. Kept with the draft on the device.

/** A replay from this device's draft store, if it looks like one. */
function asReplay(v: unknown): Replay | null {
  const o = v && typeof v === 'object' ? (v as Partial<Replay>) : null;
  return o && typeof o.base === 'string' && Array.isArray(o.chunks) ? { base: o.base, chunks: o.chunks } : null;
}

export function useWritingReplay(onKept: (r: Replay, text: string) => void) {
  const replay = useRef<Replay | null>(null);
  // The text as the replay last kept it, and when.
  const prev = useRef('');
  const at = useRef(0);
  const pasting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kept = useRef(onKept);
  useEffect(() => { kept.current = onKept; }, [onKept]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const keep = useCallback((next: string, paste = false) => {
    if (!replay.current) return;
    const r = record(replay.current, prev.current, next, Date.now(), paste);
    if (r === replay.current) return;
    replay.current = r;
    prev.current = next;
    at.current = Date.now();
    kept.current(r, next);
  }, []);

  /** The draft's replay is back (or none was kept: it starts from the draft's text). */
  const restore = useCallback((saved: unknown, text: string) => {
    const r = asReplay(saved);
    replay.current = r ?? { base: text, chunks: [] };
    prev.current = r ? textAt(r, r.chunks.length) : text;
  }, []);

  /** Call before the textarea's value changes (it starts from `before` on the first change). */
  const changed = useCallback((before: string, next: string) => {
    if (!replay.current) { replay.current = { base: before, chunks: [] }; prev.current = before; }
    if (timer.current) clearTimeout(timer.current);
    if (pasting.current) { pasting.current = false; keep(next, true); return; }
    if (Date.now() - at.current >= EVERY_MS) keep(next);
    // What was written last is kept once they stop for a while.
    else timer.current = setTimeout(() => keep(next), EVERY_MS);
  }, [keep]);

  /** A paste: what came before it is kept first, so the paste is a change of its own. */
  const pasted = useCallback((before: string) => {
    if (!replay.current) { replay.current = { base: before, chunks: [] }; prev.current = before; }
    keep(before);
    pasting.current = true;
  }, [keep]);

  /** The replay to hand in with `text` (null when nothing was written on this device). */
  const final = useCallback((text: string): Replay | null => {
    if (timer.current) clearTimeout(timer.current);
    keep(text);
    return replay.current && replay.current.chunks.length ? replay.current : null;
  }, [keep]);

  const reset = useCallback(() => { replay.current = null; prev.current = ''; at.current = 0; }, []);
  const current = useCallback(() => replay.current, []);

  return { restore, changed, pasted, final, reset, current };
}
