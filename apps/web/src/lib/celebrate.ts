// A short celebration at a milestone (M45): a burst of the brand's sparks from where it happened
// (the button pressed), under a second, plus the success vibration (and chime, when sounds are on).
// Transform and opacity only; with Reduce Motion just the vibration; fewer sparks on low-end phones.
import { haptic } from './haptics';
import { EASE_OUT, lowEndDevice, reducedMotion } from './page-transition';

const COLORS = ['#fe81d1', '#ff9fdc', '#a9b4ff', '#ffd6f0', '#ffffff'];

export function celebrate(from?: Element | null) {
  haptic('success');
  if (typeof document === 'undefined' || reducedMotion()) return;
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2, y = r ? r.top + r.height / 2 : window.innerHeight / 3;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:200`;
  const n = lowEndDevice() ? 10 : 22;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 50 + Math.random() * 70, size = 4 + Math.random() * 5;
    s.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;border-radius:${i % 3 ? '50%' : '2px'};background:${COLORS[i % COLORS.length]}`;
    layer.appendChild(s);
    s.animate([
      { transform: 'translate3d(0,0,0) scale(0.9)', opacity: 1 },
      { transform: `translate3d(${Math.cos(a) * d}px, ${Math.sin(a) * d + 30}px, 0) scale(0.4) rotate(${Math.random() * 180}deg)`, opacity: 0 },
    ], { duration: 650 + Math.random() * 250, easing: EASE_OUT, fill: 'forwards' });
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1000);
}
