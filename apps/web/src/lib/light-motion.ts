import { reducedMotion } from '@/lib/page-transition';

// Light that answers people (M11, "more animations like this everywhere, in a different way"), for
// every page, started once with the scroll motion (src/components/ScrollMotion.tsx):
//   · sparks: pressing a main button (or anything marked data-spark) throws a small two-tone burst
//     of light from the finger or pointer;
// The other parts are CSS on classes the motion layer already sets (globals.css, "M11"): the edge
// beam on cards under the pointer (.sheen), the beam that runs once round a card as it rises in
// (.beam-once, scroll-motion.ts), the glint on filled bars (.bar-glint), the comet on the page bar.

const SPARK_TARGET = '.btn-primary, [data-spark]';
const COLOURS = ['#a5b4fc', '#c4b5fd', '#f0abfc', '#e879f9', '#ffffff'];

function burst(x: number, y: number) {
  const host = document.createElement('div');
  host.className = 'spark-burst';
  host.setAttribute('aria-hidden', 'true');
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.18;
    const d = 26 + ((i * 7) % 5) * 7;
    s.style.background = COLOURS[i % COLOURS.length];
    host.appendChild(s);
    s.animate(
      [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 }],
      { duration: 520 + (i % 4) * 60, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }
  // The ring of light the sparks leave from.
  const ring = document.createElement('i');
  host.appendChild(ring);
  ring.animate([{ transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.8 }, { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }], { duration: 480, easing: 'ease-out', fill: 'forwards' });
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 800);
}

/** Starts the light that answers presses, for the whole app (once). Returns a stop function. */
export function startLightMotion(): () => void {
  if (typeof window === 'undefined' || reducedMotion()) return () => {};
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const el = (e.target as Element | null)?.closest?.(SPARK_TARGET) as HTMLElement | null;
    if (!el || el.matches(':disabled, [aria-disabled="true"]') || el.closest('[data-no-motion]')) return;
    burst(e.clientX, e.clientY);
  };
  document.addEventListener('pointerdown', onDown, { passive: true });
  return () => document.removeEventListener('pointerdown', onDown);
}
