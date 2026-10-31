import { reducedMotion } from '@/lib/page-transition';

// Light that answers people (M11, "more animations like this everywhere, in a different way"), for
// every page, started once with the scroll motion (src/components/ScrollMotion.tsx):
//   · sparks: pressing a main button (or anything marked data-spark) throws a small two-tone burst
//     of light from the finger or pointer;
// The other parts are CSS on classes the motion layer already sets (globals.css, "M11"): the edge
// beam on cards under the pointer (.sheen), the beam that runs once round a card as it rises in
// (.beam-once, scroll-motion.ts), the glint on filled bars (.bar-glint), the comet on the page bar.

const SPARK_TARGET = '.btn-primary, [data-spark]';
const COLOURS = ['#a0a9cc', '#a0a9cc', '#ff9fdc', '#fe81d1', '#ffffff'];

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

// M41 · More motion everywhere (the owner: "modern, futuristic, unique and ultra smooth… everywhere"):
//   · a ripple of light spreading from the finger in every button and tab you press;
//   · [data-magnetic] and the landing's buttons (.mkt-cta): an element leans toward the pointer and springs back (main calls to action);
//   · [data-tilt]: a picture tilts in 3D with the pointer (the landing's hero scenes);
//   · [data-cursor-light]: a soft pink light follows the pointer inside that area (the landing page).
// One pointer listener each, frames only while something moves; touch screens get the ripple only.
const RIPPLE_TARGET = '.mkt-cta, .btn-primary, .btn-secondary, .btn-ghost, .btn-icon, .btn-danger, [role="tab"], [data-ripple]';

function ripple(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const dot = document.createElement('span');
  dot.className = 'press-ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${x - r.left - size / 2}px`;
  dot.style.top = `${y - r.top - size / 2}px`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.classList.add('has-ripple');
  el.appendChild(dot);
  setTimeout(() => dot.remove(), 650);
}

/** Leaning toward the pointer (magnetic) and tilting (3D), eased each frame, back at rest when it leaves. */
function startFollow(): () => void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return () => {};
  type Item = { el: HTMLElement; kind: 'magnetic' | 'tilt'; x: number; y: number; tx: number; ty: number };
  const items = new Map<HTMLElement, Item>();
  let frame = 0;
  const tick = () => {
    frame = 0;
    for (const it of items.values()) {
      it.x += (it.tx - it.x) * 0.18; it.y += (it.ty - it.y) * 0.18;
      it.el.style.transform = it.kind === 'magnetic'
        ? `translate3d(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px, 0)`
        : `perspective(1100px) rotateX(${(-it.y).toFixed(2)}deg) rotateY(${it.x.toFixed(2)}deg)`;
      if (Math.abs(it.tx - it.x) + Math.abs(it.ty - it.y) < 0.02 && it.tx === 0 && it.ty === 0) { it.el.style.transform = ''; items.delete(it.el); }
    }
    if (items.size) frame = requestAnimationFrame(tick);
  };
  const onMove = (e: PointerEvent) => {
    const t = e.target as Element | null;
    for (const it of items.values()) if (!it.el.contains(t)) { it.tx = 0; it.ty = 0; }
    const el = t?.closest?.('[data-magnetic], .mkt-cta, [data-tilt]') as HTMLElement | null;
    if (el && !el.closest('[data-no-motion-follow]')) {
      const kind = el.hasAttribute('data-tilt') ? 'tilt' : 'magnetic';
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const it = items.get(el) ?? { el, kind, x: 0, y: 0, tx: 0, ty: 0 };
      it.tx = kind === 'magnetic' ? dx * 6 : dx * 7; it.ty = kind === 'magnetic' ? dy * 4 : dy * 6;
      items.set(el, it);
    }
    if (items.size && !frame) frame = requestAnimationFrame(tick);
  };
  const onLeave = () => { for (const it of items.values()) { it.tx = 0; it.ty = 0; } if (items.size && !frame) frame = requestAnimationFrame(tick); };
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); cancelAnimationFrame(frame); };
}

/** A soft light under the pointer inside [data-cursor-light] (it writes --mx / --my there; CSS draws it). */
function startCursorLight(): () => void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};
  let frame = 0, x = 0, y = 0, host: HTMLElement | null = null;
  const draw = () => { frame = 0; if (host) { host.style.setProperty('--mx', `${x}px`); host.style.setProperty('--my', `${y}px`); } };
  const onMove = (e: PointerEvent) => {
    host = (e.target as Element | null)?.closest?.('[data-cursor-light]') as HTMLElement | null;
    if (!host) return;
    const r = host.getBoundingClientRect();
    x = e.clientX - r.left; y = e.clientY - r.top;
    if (!frame) frame = requestAnimationFrame(draw);
  };
  document.addEventListener('pointermove', onMove, { passive: true });
  return () => { document.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
}

/** Starts the light that answers presses and pointers, for the whole app (once). Returns a stop function. */
export function startLightMotion(): () => void {
  if (typeof window === 'undefined' || reducedMotion()) return () => {};
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element | null;
    if (t?.closest?.('[data-no-motion-follow]')) return;
    const spark = t?.closest?.(SPARK_TARGET) as HTMLElement | null;
    if (spark && !spark.closest('[data-no-motion]') && !spark.matches(':disabled, [aria-disabled="true"]')) burst(e.clientX, e.clientY);
    // The ripple ignores data-no-motion (that opts out of the scroll reveals); data-no-motion-follow opts out of both.
    const press = t?.closest?.(RIPPLE_TARGET) as HTMLElement | null;
    if (press && !press.matches(':disabled, [aria-disabled="true"]')) ripple(press, e.clientX, e.clientY);
  };
  document.addEventListener('pointerdown', onDown, { passive: true });
  const stopFollow = startFollow();
  const stopLight = startCursorLight();
  return () => { document.removeEventListener('pointerdown', onDown); stopFollow(); stopLight(); };
}
