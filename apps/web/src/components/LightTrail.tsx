'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { lowEndDevice, reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';

// The river of light behind every page, website and app (M9, the owner's Relay video: "the purple
// line… goes down till the bottom of the page"): a bundle of fine indigo-to-fuchsia strands winding
// from the top of the page to the very bottom, tight and white-hot at each bend and fanning out in
// between, swaying slowly, with sparks drifting down it. It belongs to the page, not the screen: it
// moves with whatever is scrolling (the window, or the app's own scrolling panel), so it travels
// down the page with the reader.
// A 2D canvas the size of the screen; only the visible stretch is drawn. Additive light on dark,
// softer ink on light. At most 30 frames a second, and only while something moves; still for Reduce
// Motion (it still follows the scroll) and on low-memory phones; nothing while the tab is hidden.

const DARK = ['#818cf8', '#a78bfa', '#e879f9', '#f0abfc', '#c084fc', '#6366f1'];
const LIGHT = ['#6366f1', '#7c3aed', '#c026d3', '#a21caf', '#8b5cf6', '#4f46e5'];

/** `tone="dark"`: always the dark look (the landing page). `from`: start this many screens down. `strength`: 0–1. */
export function LightTrail({ tone = 'auto', from = 0, strength = 1, className }: { tone?: 'auto' | 'dark'; from?: number; strength?: number; className?: string }) {
  const pathname = usePathname();
  // The landing page draws its own (dark) river: the root one would sit hidden under it.
  if (tone === 'auto' && pathname === '/') return null;
  return <River tone={tone} from={from} strength={strength} className={className} />;
}

function River({ tone, from, strength, className }: { tone: 'auto' | 'dark'; from: number; strength: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = reducedMotion() || lowEndDevice();
    const phone = window.innerWidth < 640;
    const N = still || phone ? 14 : 26;
    const strands = Array.from({ length: N }, (_, i) => {
      const o = i / (N - 1) - 0.5;
      return { o, colour: i % DARK.length, alpha: 0.2 + 0.6 * (1 - Math.abs(o) * 1.7), width: 0.6 + ((i * 13) % 7) / 7, speed: 0.3 + ((i * 37) % 10) / 25, phase: i * 1.3 };
    });
    const sparks = Array.from({ length: phone ? 18 : 40 }, (_, i) => ({ s: (i * 7) % N, base: (i * 137) % 1000, v: 18 + ((i * 29) % 30), r: 0.6 + ((i * 17) % 10) / 12 }));
    let W = 0, H = 0, frame = 0, last = 0, scroller: Element | null = null, sy = 0;

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      // Sharp, but never more than ~2.6 million pixels a frame.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1, Math.sqrt(2.6e6 / Math.max(1, W * H)));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const readScroll = () => {
      if (scroller && !scroller.isConnected) scroller = null; // that page's panel is gone
      sy = scroller ? scroller.scrollTop : window.scrollY;
    };

    const draw = (ms: number) => {
      const t = still ? 6 : ms / 1000;
      const dark = tone === 'dark' || document.documentElement.classList.contains('dark');
      const colours = dark ? DARK : LIGHT;
      const P = Math.max(1100, H * 1.5); // one full swing, left to right and back
      const A = W < 640 ? 0.3 : 0.36;
      const start = from * H;
      const theta = (y: number) => (2 * Math.PI * y) / P + 0.6;
      const centre = (y: number) => W * (0.5 + A * Math.sin(theta(y) + 0.08 * Math.sin(t * 0.15)));
      const spread = (y: number) => W * (0.012 + 0.07 * Math.abs(Math.cos(theta(y))));
      const fade = (y: number) => (from ? Math.min(1, Math.max(0, (y - start) / (H * 0.5))) : 1);
      readScroll();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const y0 = Math.max(start, sy - 80), y1 = sy + H + 80;
      if (y1 <= y0) return;
      const step = 14;
      const line = (x: (y: number) => number) => {
        ctx.beginPath();
        for (let y = y0; y <= y1; y += step) {
          const px = x(y), py = y - sy;
          if (y === y0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      const k = (dark ? 1 : 0.5) * strength;
      // The glow: wide faint passes along the middle.
      ctx.strokeStyle = dark ? '#a78bfa' : '#8b5cf6';
      for (const [lw, a] of [[80, 0.035], [32, 0.06], [12, 0.1]] as const) { ctx.globalAlpha = a * k * fade(sy + H * 0.5); ctx.lineWidth = lw; line(centre); }
      for (const st of strands) {
        ctx.strokeStyle = colours[st.colour];
        ctx.globalAlpha = st.alpha * k * fade(sy + H * 0.5);
        ctx.lineWidth = st.width;
        line((y) => centre(y) + st.o * 2 * spread(y) + Math.sin(y / 170 + t * st.speed + st.phase) * 5);
      }
      // A white-hot knot at each bend in view.
      // Bends are where the swing turns: theta = π/2 + nπ.
      for (let n = Math.floor(((2 * Math.PI * (y0 - 200)) / P - Math.PI / 2 + 0.6) / Math.PI); ; n++) {
        const yb = ((Math.PI / 2 + n * Math.PI - 0.6) * P) / (2 * Math.PI);
        if (yb > y1 + 200) break;
        const bx = centre(yb), by = yb - sy;
        const r = Math.min(W, H) * 0.22;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, dark ? 'rgba(255,255,255,0.32)' : 'rgba(192,38,211,0.14)');
        g.addColorStop(0.2, dark ? 'rgba(240,171,252,0.3)' : 'rgba(167,139,250,0.1)');
        g.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.globalAlpha = fade(yb) * strength;
        ctx.fillStyle = g;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }
      // Sparks drifting down the strands.
      ctx.fillStyle = dark ? '#f5d0fe' : '#a21caf';
      for (const sp of sparks) {
        const ys = ((sp.base + t * sp.v) % (H + 120)) - 60;
        const y = sy + ys;
        if (y < y0) continue;
        const st = strands[sp.s];
        const x = centre(y) + st.o * 2 * spread(y) + Math.sin(y / 170 + t * st.speed + st.phase) * 5;
        ctx.globalAlpha = (0.3 + 0.6 * Math.abs(Math.sin(t * 1.7 + sp.s))) * k * fade(y);
        ctx.beginPath();
        ctx.arc(x, ys, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    // Moving on its own: at most 30 frames a second. Still: one frame per scroll or resize.
    const loop = (ms: number) => {
      frame = 0;
      if (document.hidden) return;
      if (ms - last > 32) { last = ms; draw(ms); }
      frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (still) { if (!frame) frame = requestAnimationFrame((ms) => { frame = 0; draw(ms); }); return; }
      if (!frame) frame = requestAnimationFrame(loop);
    };
    // Whatever scrolls the page (the window, or the app's panel: scroll events don't bubble, so
    // listen on the way down). A panel counts if it's at least half the screen tall.
    const onScroll = (e: Event) => {
      const el = e.target;
      if (el === document || el === document.documentElement || el === document.body) scroller = null;
      // Not the side menu, a dialog or a sheet: only the page itself moves the river.
      else if (el instanceof Element && el.clientHeight > window.innerHeight * 0.5 && !el.closest('aside, nav, [role="dialog"], [aria-modal="true"]')) scroller = el;
      else return;
      readScroll();
      if (still) kick();
    };
    resize();
    readScroll();
    kick();
    const onResize = () => { resize(); kick(); };
    const onVisible = () => { if (!document.hidden) kick(); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    // The theme can change (Settings → Appearance): redraw then too.
    const themeWatch = new MutationObserver(() => kick());
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      themeWatch.disconnect();
    };
  }, [tone, from, strength]);

  return <canvas ref={ref} aria-hidden data-no-motion className={cn('light-river', className)} />;
}
