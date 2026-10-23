'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { EASE_GLIDE, EASE_OUT, reducedMotion } from '@/lib/page-transition';

// Code boxes (M6, the owner's "4 boxes, one ring" video): one box per digit, the box you're on glows.
// When the last digit is in, the boxes leave the row for a ring round a dot and the ring spins while
// the code is checked; if it's right they turn green, settle, fold into one box with a tick and a
// burst of sparks; if not they fly back into the row, flash red and shake. One real <input> sits over
// the boxes (paste, phone autofill "one-time-code", screen readers all work). Reduce Motion: colour
// changes only. Styles: globals.css, "M6 · Code boxes".

export type OtpStatus = 'idle' | 'checking' | 'good' | 'bad';
const SPIN_MS = 1500;
const SPARKS = 16;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function OtpInput({ length = 6, value, onChange, onComplete, status = 'idle', onSettled, label = 'Code', onDark, autoFocus }: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  /** All boxes filled. */
  onComplete?: (v: string) => void;
  status?: OtpStatus;
  /** The "good" or "bad" animation has finished (then go on, or clear the code). */
  onSettled?: (s: 'good' | 'bad') => void;
  label?: string;
  /** On the always-dark sign-in screens. */
  onDark?: boolean;
  autoFocus?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const shownLen = useRef(value.length);
  const settled = useRef(onSettled);
  useEffect(() => { settled.current = onSettled; });

  // A digit pops into its box.
  useEffect(() => {
    const prev = shownLen.current;
    shownLen.current = value.length;
    if (value.length <= prev || reducedMotion()) return;
    const el = row.current?.querySelectorAll<HTMLElement>('.otp-digit')[value.length - 1];
    el?.animate([{ transform: 'translateY(40%) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE_OUT });
  }, [value]);

  // The ring: in while checking, then the good or bad ending.
  const ring = useRef<{ at: number; spin?: Animation; offsets: { x: number; y: number }[]; s: number; r: number } | null>(null);
  useEffect(() => {
    const c = box.current, rw = row.current;
    if (!c || !rw) return;
    const boxes = [...rw.querySelectorAll<HTMLElement>('.otp-box')];
    const still = reducedMotion() || typeof rw.animate !== 'function';
    let live = true;

    if (status === 'checking' && !ring.current && !still) {
      const s = boxes[0]?.offsetWidth ?? 48;
      const r = Math.max(s * 1.25, (s * 0.64) / Math.sin(Math.PI / boxes.length));
      const cx = rw.offsetWidth / 2, cy = rw.offsetHeight / 2;
      const offsets = boxes.map((b, i) => {
        const a = Math.PI + (i * 2 * Math.PI) / boxes.length;
        return { x: cx + r * Math.cos(a) - (b.offsetLeft + s / 2), y: cy + r * Math.sin(a) - (b.offsetTop + s / 2) };
      });
      ring.current = { at: performance.now(), offsets, s, r };
      c.style.setProperty('--otp-r', `${r}px`);
      c.style.height = `${c.offsetHeight}px`;
      void c.offsetHeight;
      c.style.height = `${2 * r + s + 12}px`;
      c.classList.add('is-ring');
      boxes.forEach((b, i) => b.animate([{ transform: 'none' }, { transform: `translate(${offsets[i].x}px, ${offsets[i].y}px)` }], { duration: 520, delay: i * 35, easing: 'cubic-bezier(.2,.9,.25,1.12)', fill: 'forwards' }));
      setTimeout(() => {
        if (live && ring.current && !ring.current.spin) ring.current.spin = rw.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: SPIN_MS, iterations: Infinity });
      }, 520 + boxes.length * 35);
      return () => { live = false; };
    }

    if (status !== 'good' && status !== 'bad') return;
    void (async () => {
      const ended = () => settled.current?.(status);
      if (still || !ring.current) {
        c.classList.add(status === 'good' ? 'is-good' : 'is-bad');
        if (status === 'good') done.current?.classList.add('is-shown');
        await wait(status === 'good' ? 450 : 700);
        if (!live) return;
        c.classList.remove('is-bad');
        return ended();
      }
      const g = ring.current;
      // Let the ring form and turn a little, however fast the answer came.
      await wait(Math.max(0, 1000 - (performance.now() - g.at)));
      if (!live) return;
      const t = Number(g.spin?.currentTime ?? 0);
      const angle = ((t % SPIN_MS) / SPIN_MS) * 360;
      g.spin?.cancel();
      const digits = [...rw.querySelectorAll<HTMLElement>('.otp-digit')];
      if (status === 'good') {
        // Slow to a stop on a slot, digits upright, then green.
        const step = 360 / boxes.length;
        const to = Math.ceil((angle + step * 0.6) / step) * step;
        rw.animate([{ transform: `rotate(${angle}deg)` }, { transform: `rotate(${to}deg)` }], { duration: 560, easing: EASE_GLIDE, fill: 'forwards' });
        digits.forEach((d) => d.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-(to % 360)}deg)` }], { duration: 560, easing: EASE_GLIDE, fill: 'forwards' }));
        await wait(420);
        if (!live) return;
        c.classList.add('is-good');
        await wait(520);
        if (!live) return;
        // Fold into one box in the middle.
        boxes.forEach((b, i) => b.animate([
          { transform: `translate(${g.offsets[i].x}px, ${g.offsets[i].y}px)`, opacity: 1 },
          { transform: `translate(${rw.offsetWidth / 2 - b.offsetLeft - g.s / 2}px, ${rw.offsetHeight / 2 - b.offsetTop - g.s / 2}px) scale(.7)`, opacity: 0 },
        ], { duration: 380, delay: i * 18, easing: 'cubic-bezier(.55,0,.75,.3)', fill: 'forwards' }));
        c.classList.add('is-ring-out');
        await wait(360);
        if (!live) return;
        const d = done.current;
        if (d) {
          d.classList.add('is-shown');
          d.animate([{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, easing: EASE_OUT });
          d.querySelectorAll<HTMLElement>('.otp-wave').forEach((w, i) => w.animate([{ transform: 'scale(1)', opacity: 0.85 }, { transform: `scale(${2.1 + i * 0.7})`, opacity: 0 }], { duration: 900 + i * 200, delay: 60 + i * 90, easing: EASE_OUT, fill: 'both' }));
          d.querySelectorAll<HTMLElement>('.otp-spark').forEach((p, i) => {
            const a = (i / SPARKS) * Math.PI * 2 + (i % 3) * 0.21;
            const dist = g.s * (1.15 + ((i * 7) % 5) * 0.22);
            p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px) scale(.4)`, opacity: 0 }], { duration: 760 + (i % 4) * 90, delay: 40, easing: EASE_OUT, fill: 'both' });
          });
        }
        await wait(620);
        if (live) ended();
        return;
      }
      // Wrong: back into the row, red, a shake.
      const back = angle > 180 ? 360 : 0;
      rw.animate([{ transform: `rotate(${angle}deg)` }, { transform: `rotate(${back}deg)` }], { duration: 460, easing: EASE_GLIDE });
      boxes.forEach((b, i) => b.animate([{ transform: `translate(${g.offsets[i].x}px, ${g.offsets[i].y}px)` }, { transform: 'none' }], { duration: 460, easing: EASE_GLIDE, fill: 'forwards' }));
      c.style.height = `${c.offsetHeight}px`;
      void c.offsetHeight;
      c.style.height = `${g.s}px`;
      c.classList.remove('is-ring');
      await wait(460);
      if (!live) return;
      boxes.forEach((b) => b.getAnimations().forEach((a) => a.cancel()));
      c.style.height = '';
      ring.current = null;
      c.classList.add('is-bad');
      rw.animate([0, -10, 9, -6, 4, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 420, easing: 'ease-out' });
      await wait(560);
      if (!live) return;
      c.classList.remove('is-bad');
      ended();
    })();
    return () => { live = false; };
  }, [status]);

  const busy = status !== 'idle';
  const at = Math.min(value.length, length - 1);
  return (
    <div ref={box} className={cn('otp', onDark && 'otp-on-dark')} style={{ '--otp-n': length } as React.CSSProperties}>
      <div ref={row} className="otp-row" aria-hidden>
        {Array.from({ length }, (_, i) => (
          <div key={i} className={cn('otp-box', value[i] && 'is-filled', focused && !busy && i === at && 'is-active')}>
            <span className="otp-digit">{value[i] ?? ''}</span>
            {focused && !busy && i === at && !value[i] && <span className="otp-caret" />}
          </div>
        ))}
      </div>
      <span className="otp-dot" aria-hidden />
      <div ref={done} className="otp-done" aria-hidden>
        <span className="otp-wave" /><span className="otp-wave" />
        {Array.from({ length: SPARKS }, (_, i) => <span key={i} className="otp-spark" />)}
        <svg viewBox="0 0 24 24" className="otp-tick" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>
      </div>
      <input
        className="otp-input"
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        autoFocus={autoFocus}
        readOnly={busy}
        aria-label={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(e) => { const t = e.currentTarget; if (t.selectionStart !== t.value.length) t.setSelectionRange(t.value.length, t.value.length); }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(v);
          if (v.length === length && v !== value) onComplete?.(v);
        }}
      />
      <span className="sr-only" role="status">{status === 'checking' ? 'Checking the code…' : status === 'good' ? 'Code accepted' : ''}</span>
    </div>
  );
}
