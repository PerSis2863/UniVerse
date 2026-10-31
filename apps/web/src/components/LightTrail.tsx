'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { lowEndDevice, reducedMotion } from '@/lib/page-transition';
import { cn } from '@/lib/utils';

// The river of light behind every page, website and app (M9/M10, the owner's Relay video in
// UniVerse's two tones): one continuous river from the top of the page to the very bottom.
//   · soft bands: wide, out-of-focus ribbons of light that drift and sway (drawn at a quarter of the
//     size and stretched: a free, smooth blur that also works in Safari);
//   · fine strands: a dense bundle, tight and white-hot at each bend, fanning out in between;
//   · pulses: light running down the strands; and sparks drifting along them;
//   · it answers the pointer (or a finger): the strands part round it and glow there (M11).
// On the landing page it pours in from the top right when the page opens, bends in the gap between
// the hero's words and its card, and carries on down the page. It belongs to the page: it moves with
// whatever scrolls (the window, or the app's own panel; not menus or dialogs).
// Cheap on purpose: one canvas the size of the screen (≤2.2 M pixels), only the visible stretch is
// drawn; 60 frames a second on computers, 30 on phones (and it goes lighter by itself if frames come
// late, then holds still if they still do: M46's low-end phone check found it kept a budget phone's
// processor fully busy); in the app it starts moving once the page has loaded; still for Reduce
// Motion and low-memory phones; nothing while the tab is hidden.

// The owner (24 Oct 2026): the light lines are hot pink with a little purple. M34 (25 Oct, the
// Karma look): kept, denser, thinner and sharper, with faster pulses that glow at their heads. M52
// (31 Oct, the "Globynk" palette): Baby Pink strands with a few Aqua Jade ones and aqua sparks.
const DARK = { strands: ['#fe81d1', '#ff9fdc', '#74ffed', '#ffc0e6', '#ef88e3', '#a6fff3'], bands: ['#3a1f5c', '#a32c7b', '#14506a', '#762d72', '#126a72'], pulse: '#ffffff', spark: '#a6fff3' };
// M53: light mode in Bubblegum Pink and Galactic Violet.
const LIGHT = { strands: ['#c23d98', '#8f45d9', '#ec74ce', '#533ff6', '#a52d80', '#8270fb'], bands: ['#f7b3e6', '#e6e2ff', '#e8cdfc', '#cdc6ff', '#fde6f6'], pulse: '#3f2bd6', spark: '#8f45d9' };

const OWN_RIVER = new Set(['/', '/login', '/register']);

/**
 * `tone="dark"`: always the dark look (the landing page). `hero`: the landing page's opening (the
 * first bend between the hero's words and card, drawn in on arrival). `strength`: 0–1.
 */
export function LightTrail({ tone = 'auto', hero = false, strength = 1, className }: { tone?: 'auto' | 'dark'; hero?: boolean; strength?: number; className?: string }) {
  const pathname = usePathname();
  // The landing page and sign-in draw their own (dark) river: the root one would sit hidden under it.
  if (tone === 'auto' && OWN_RIVER.has(pathname)) return null;
  return <River tone={tone} hero={hero} strength={strength} className={className} />;
}

function River({ tone, hero, strength, className }: { tone: 'auto' | 'dark'; hero: boolean; strength: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    const soft = document.createElement('canvas');
    const sctx = soft.getContext('2d');
    if (!cv || !ctx || !sctx) return;
    const still = reducedMotion() || lowEndDevice();
    const phone = window.innerWidth < 640;
    const N = still ? 40 : phone ? 60 : 120;
    // Denser in the middle of the bundle, like fibres.
    const strands = Array.from({ length: N }, (_, i) => {
      const u = (i / (N - 1)) * 2 - 1;
      const o = Math.sign(u) * Math.pow(Math.abs(u), 1.5) * 0.5;
      return { o, colour: i % 6, alpha: 0.18 + 0.55 * (1 - Math.abs(o) * 1.6), width: 0.35 + ((i * 13) % 9) / 14, speed: 0.5 + ((i * 37) % 10) / 10, phase: i * 1.37, wob: 120 + ((i * 29) % 70), pulse: i % 2 === 0 };
    });
    const bands = [-0.9, -0.35, 0.1, 0.55, 1.0].map((o, i) => ({ o, width: [150, 90, 200, 70, 120][i], alpha: [0.1, 0.14, 0.08, 0.16, 0.1][i], colour: i, phase: i * 2.1, speed: 0.18 + i * 0.05 }));
    const sparks = Array.from({ length: phone ? 60 : 150 }, (_, i) => ({ s: (i * 7) % N, base: (i * 137) % 1000, v: 34 + ((i * 29) % 60), r: 0.6 + ((i * 17) % 14) / 10 }));
    let W = 0, H = 0, frame = 0, last = 0, scroller: Element | null = null, sy = 0;
    // Lighter when the device struggles: half the strands and 30 frames a second; then `calm`: held
    // still at that moment, drawn once per scroll like Reduce Motion (see loop).
    let lite = false, calm = false, calmT = 0;
    // The soft bands move slowly: repaint them every third frame (or after a scroll) and reuse them.
    let softFrame = 0, softAt = NaN;
    // The pointer (or finger): the strands part round it and it glows (M11). `pv` eases in and out.
    let px = -9999, py = -9999, pAt = -1e9, pv = 0;
    const born = performance.now();

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1, Math.sqrt(2.2e6 / Math.max(1, W * H)));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      soft.width = Math.max(1, Math.round(W / 4)); soft.height = Math.max(1, Math.round(H / 4));
      sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    };
    const readScroll = () => {
      if (scroller && !scroller.isConnected) scroller = null; // that page's panel is gone
      sy = scroller ? scroller.scrollTop : window.scrollY;
    };

    const draw = (ms: number) => {
      readScroll();
      const t = still ? 8 : calm ? calmT : ms / 1000;
      const dark = tone === 'dark' || document.documentElement.classList.contains('dark');
      const pal = dark ? DARK : LIGHT;
      const k = (dark ? 1 : 0.85) * strength;
      const P = Math.max(1100, H * 1.55); // one full swing, left to right and back
      const wide = W >= 1024;
      // The path, in page coordinates. On the landing page the first bend sits in the hero's gap
      // (a narrower swing to start with, growing to the full width further down).
      const knot = H * 0.46;
      const phi = hero ? -Math.PI / 2 - (2 * Math.PI * knot) / P : 0.6;
      const ramp = (y: number) => (hero ? Math.min(1, Math.max(0, (y - knot) / (H * 1.1))) : 1);
      const theta = (y: number) => (2 * Math.PI * y) / P + phi;
      const centre = (y: number) => {
        const r = ramp(y);
        const c = hero && wide ? 0.63 - 0.13 * r : 0.5;
        const A = hero && wide ? 0.15 + 0.2 * r : W < 640 ? 0.3 : 0.36;
        return W * (c + A * Math.sin(theta(y)) + 0.018 * Math.sin(t * 0.35 + y / 650) + 0.008 * Math.sin(t * 0.9 + y / 260));
      };
      const spread = (y: number) => W * (0.01 + 0.08 * Math.abs(Math.cos(theta(y))));
      // On arrival (landing page), the river pours in from the top over ~1.8 s.
      const grow = hero && !still ? Math.min(1, (ms - born) / 1800) : 1;
      const eased = 1 - Math.pow(1 - grow, 3);
      const y0 = sy - 80;
      const y1 = Math.min(sy + H + 80, hero && grow < 1 ? -80 + eased * (H * 1.25) : Infinity);
      ctx.clearRect(0, 0, W, H);
      if (y1 <= y0) return;
      const step = phone ? 16 : 12;
      const trace = (c: CanvasRenderingContext2D, x: (y: number) => number) => {
        c.beginPath();
        for (let y = y0; y <= y1; y += step) {
          if (y === y0) c.moveTo(x(y), y - sy); else c.lineTo(x(y), y - sy);
        }
        c.stroke();
      };
      pv += ((ms - pAt < 2500 ? 1 : 0) - pv) * 0.08;
      const near = pv > 0.01;
      // Strands near the pointer lean away from it, smoothly (no jump at its centre), like hair.
      const part = (x: number, y: number) => {
        if (!near) return 0;
        const dy = y - sy - py, dx = x - px;
        if (dy > 420 || dy < -420) return 0;
        return pv * 70 * Math.exp(-(dy * dy) / 45000) * (dx / 130) * Math.exp(-(dx * dx) / 33800);
      };
      const strandX = (st: (typeof strands)[number]) => (y: number) => {
        const x = centre(y) + st.o * 2 * spread(y) + Math.sin(y / st.wob + t * st.speed + st.phase) * (4 + 10 * Math.abs(st.o));
        return x + part(x, y);
      };

      // 1 · The soft bands (a quarter-size canvas, stretched: soft-focus light).
      const repaint = still || softAt !== sy || grow < 1 || softFrame++ % 3 === 0;
      if (repaint) {
        softAt = sy;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, soft.width, soft.height);
        sctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
        sctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
        sctx.lineCap = 'round';
        sctx.lineJoin = 'round';
        for (const b of bands) {
          sctx.strokeStyle = pal.bands[b.colour];
          sctx.globalAlpha = b.alpha * k * (0.4 + 0.6 * eased) * (hero ? 1 : 0.7);
          sctx.lineWidth = b.width * (phone ? 0.6 : 1);
          trace(sctx, (y) => centre(y) + b.o * spread(y) * 1.3 + Math.sin(t * b.speed + b.phase + y / 520) * 46);
        }
        // A glow where the pointer touches the river.
        if (near && Math.abs(px - centre(sy + py)) < spread(sy + py) + 220) {
          const g = sctx.createRadialGradient(px, py, 0, px, py, 180);
          g.addColorStop(0, dark ? 'rgba(255,192,230,0.35)' : 'rgba(236,116,206,0.14)');
          g.addColorStop(1, 'rgba(43,53,104,0)');
          sctx.globalAlpha = pv * k;
          sctx.fillStyle = g;
          sctx.fillRect(px - 180, py - 180, 360, 360);
        }
        // A white-hot glow at each bend in view (bends are where the swing turns: theta = π/2 + nπ).
        for (let n = Math.floor(((2 * Math.PI * (y0 - 300)) / P + phi - Math.PI / 2) / Math.PI); ; n++) {
          const yb = ((Math.PI / 2 + n * Math.PI - phi) * P) / (2 * Math.PI);
          if (yb > y1 + 300) break;
          const bx = centre(yb), by = yb - sy, r = Math.min(W, H) * 0.3;
          const g = sctx.createRadialGradient(bx, by, 0, bx, by, r);
          g.addColorStop(0, dark ? 'rgba(255,255,255,0.55)' : 'rgba(236,116,206,0.18)');
          g.addColorStop(0.25, dark ? 'rgba(255,159,220,0.28)' : 'rgba(83,63,246,0.1)');
          g.addColorStop(1, 'rgba(43,53,104,0)');
          sctx.globalAlpha = k;
          sctx.fillStyle = g;
          sctx.fillRect(bx - r, by - r, r * 2, r * 2);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(soft, 0, 0, W, H);

      // 2 · The fine strands, coloured along the river (pink, orchid and a few aqua). Bright in
      // the hero; further down (and in the app) mostly the soft glow, so text in front stays easy to read.
      const sharp = hero ? 1 - 0.5 * ramp(sy + H * 0.5) : phone ? 0.7 : 0.85;
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [i, st] of strands.entries()) {
        if (lite && i % 2) continue;
        ctx.strokeStyle = pal.strands[st.colour];
        ctx.globalAlpha = st.alpha * k * sharp;
        ctx.lineWidth = st.width;
        trace(ctx, strandX(st));
      }
      // 3 · Pulses: short bright dashes running down every other strand, each with a soft glow
      // round its head (a wide faint pass, then the bright core).
      if (!still) {
        ctx.strokeStyle = pal.pulse;
        for (const [i, st] of strands.entries()) {
          if (!st.pulse || (lite && i % 4)) continue;
          ctx.setLineDash([18 + (st.phase % 16), 150 + (st.wob % 90)]);
          // Anchored to the page (the path starts at the top of the screen), so pulses don't slide when you scroll.
          ctx.lineDashOffset = -(t * 220 * st.speed + st.phase * 40) + y0 * 1.1;
          const x = strandX(st);
          if (!phone) {
            ctx.globalAlpha = 0.16 * k * sharp;
            ctx.lineWidth = st.width + 3.5;
            trace(ctx, x);
          }
          ctx.globalAlpha = 0.8 * k * sharp;
          ctx.lineWidth = st.width + 0.6;
          trace(ctx, x);
        }
        ctx.setLineDash([]);
      }
      // 4 · Sparks drifting down the strands.
      ctx.fillStyle = pal.spark;
      for (const sp of sparks) {
        const ys = ((sp.base + t * sp.v) % (H + 120)) - 60;
        const y = sy + ys;
        if (y < y0 || y > y1) continue;
        const x = strandX(strands[sp.s])(y);
        ctx.globalAlpha = (0.3 + 0.7 * Math.abs(Math.sin(t * 2.3 + sp.s))) * k;
        ctx.beginPath();
        ctx.arc(x, ys, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    // Moving on its own: 60 frames a second on computers, 30 on phones. Still: one per scroll.
    let gap = phone ? 32 : 15;
    // How busy the device is: the average time between animation frames (8–17 ms with time to spare;
    // a budget phone kept fully busy by the river still managed one every ~42 ms, so lateness alone
    // never caught it). Judged every 60 frames: over 24 ms, lighter; over 34 ms (or still over 28 ms
    // when lighter), hold still.
    let prev = 0, avg = 16, seen = 0;
    const loop = (ms: number) => {
      frame = 0;
      if (document.hidden) { prev = 0; return; }
      if (prev) avg = avg * 0.95 + Math.min(200, ms - prev) * 0.05;
      prev = ms;
      if (++seen > 60) {
        seen = 0;
        if (avg > (lite ? 28 : 34)) { calm = true; calmT = ms / 1000; draw(ms); return; }
        if (!lite && avg > 24) { lite = true; gap = 32; }
      }
      if (ms - last >= gap) { last = ms; draw(ms); }
      frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (still || calm) { if (!frame) frame = requestAnimationFrame((ms) => { frame = 0; draw(ms); }); return; }
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
      if (still || calm) kick();
    };
    const onPointer = (e: PointerEvent) => { px = e.clientX; py = e.clientY; pAt = performance.now(); };
    const onLeave = () => { pAt = -1e9; };
    if (!still) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerdown', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    resize();
    // In the app: one frame now, moving once the page has loaded (on a slow phone the first seconds
    // belong to the page). The landing's opening pours in straight away.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const first = requestAnimationFrame(draw);
    const idle = hero || still ? (kick(), 0) : w.requestIdleCallback ? w.requestIdleCallback(kick, { timeout: 3000 }) : window.setTimeout(kick, 1500);
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
      cancelAnimationFrame(first);
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle); else window.clearTimeout(idle);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      themeWatch.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [tone, hero, strength]);

  return <canvas ref={ref} aria-hidden data-no-motion className={cn('light-river', className)} />;
}
