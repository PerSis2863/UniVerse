import { reducedMotion } from './page-transition';

// M333 (the owner, 19 Nov: "when you click using mouse only in the website it shows the animations like 4 small lines
// comes out of it… ultra smooth"): tripist.app's click effect, its Framer part in `burst` mode with its settings (size
// 60, stroke 2, 0.4 s): four short lines fanned upwards at 45°, 80°, 115° and 150° from where you clicked. Each one runs
// 15 px outwards and shrinks into its tip on power2.out, and thins away over the last 40%. tripist animates SVG
// attributes with GSAP on the page's thread; here each line is two spans moved by `transform` only (Web Animations),
// so the graphics chip runs it however busy the page is. Mouse clicks only (not touch, a pen or a key), on the
// website only (not inside the app, `[data-app-shell]`, where people click all day), nothing with Reduce Motion.

const ANGLES = [45, 80, 115, 150];
const MS = 400;
/** GSAP's power2.out. */
const POWER2_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

/** One line's run, in px from the click: its inner and outer ends at the start and the end (with its square caps). */
export const BURST = { from: [5, 16], to: [29, 31] } as const;

/** The transform that puts an 11 px line of the burst at `angle` (degrees, anticlockwise from →) and progress 0 or 1. */
export function burstTransform(angle: number, end: boolean) {
  const [inner, outer] = end ? BURST.to : BURST.from;
  const len = BURST.from[1] - BURST.from[0];
  return `rotate(${-angle}deg) translateX(${inner}px) scaleX(${(outer - inner) / len})`;
}

function burst(x: number, y: number) {
  const box = document.createElement('span');
  box.setAttribute('aria-hidden', 'true');
  box.className = 'click-burst';
  box.style.transform = `translate(${x}px, ${y}px)`;
  let last: Animation | null = null;
  for (const a of ANGLES) {
    const line = document.createElement('i'), ink = document.createElement('b');
    line.appendChild(ink);
    box.appendChild(line);
    last = line.animate([{ transform: burstTransform(a, false) }, { transform: burstTransform(a, true) }], { duration: MS, easing: POWER2_OUT, fill: 'forwards' });
    ink.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: MS * 0.4, delay: MS * 0.6, easing: 'linear', fill: 'forwards' });
  }
  document.body.appendChild(box);
  void last?.finished.then(() => box.remove(), () => box.remove());
}

/** Starts the click burst for the whole site (once, from ScrollMotion). Returns a stop function. */
export function startClickBurst(): () => void {
  if (typeof window === 'undefined') return () => {};
  let kind = '';
  const onDown = (e: PointerEvent) => { kind = e.pointerType; };
  const onClick = (e: MouseEvent) => {
    // A key's click has no detail; Safari's clicks may not say which pointer, so the press before it does.
    if (e.detail === 0 || ((e as PointerEvent).pointerType || kind) !== 'mouse' || reducedMotion()) return;
    if (e.target instanceof Element && e.target.closest('[data-app-shell]')) return;
    burst(e.clientX, e.clientY);
  };
  window.addEventListener('pointerdown', onDown, { passive: true, capture: true });
  window.addEventListener('click', onClick, { passive: true, capture: true });
  return () => { window.removeEventListener('pointerdown', onDown, { capture: true }); window.removeEventListener('click', onClick, { capture: true }); };
}
