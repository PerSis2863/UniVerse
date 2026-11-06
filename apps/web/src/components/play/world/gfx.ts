// The 3D games' graphics choice (M118, the owner: "a lot of lag … please improve that"), kept on the
// device: Smooth, Balanced (the default) or Sharp. Smooth draws straight to the screen at 1× with no
// shadows or effects; Balanced keeps the sun's shadows and the glow at up to 1.5×; Sharp adds the soft
// shadows in corners (ambient occlusion) at up to 2×. Kept apart from core.ts so the game's top bar
// can show it without loading three.js.

export type Gfx = 'smooth' | 'balanced' | 'sharp';
export const GFX: readonly Gfx[] = ['smooth', 'balanced', 'sharp'];
export const GFX_NAME: Record<Gfx, string> = { smooth: 'Smooth', balanced: 'Balanced', sharp: 'Sharp' };
/** The most pixels drawn per screen pixel for each choice. */
export const GFX_CAP: Record<Gfx, number> = { smooth: 1, balanced: 1.5, sharp: 2 };
/** The event a running world listens to when the choice changes mid-round. */
export const GFX_EVENT = 'uv-play-gfx';

const KEY = 'uv-play-gfx', FIT = 'uv-play-fit';
const fits = (): Partial<Record<Gfx, number>> => { try { return JSON.parse(localStorage.getItem(FIT) ?? '{}') ?? {}; } catch { return {}; } };

export function gfxNow(): Gfx {
  try { const v = localStorage.getItem(KEY); return v === 'smooth' || v === 'sharp' ? v : 'balanced'; } catch { return 'balanced'; }
}

/** A new choice: kept, a running world and the game's bar told. The person's own choice forgets the
 *  sharpness found for it (it starts at its best); the world lowering it by itself (`found`) keeps it. */
export function setGfx(g: Gfx, found = false) {
  try {
    localStorage.setItem(KEY, g);
    if (!found) { const f = fits(); delete f[g]; localStorage.setItem(FIT, JSON.stringify(f)); }
  } catch { /* private mode: this round only */ }
  window.dispatchEvent(new CustomEvent<Gfx>(GFX_EVENT, { detail: g }));
}
/** For useSyncExternalStore: the choice, changed here or in another tab. */
export function onGfx(fn: () => void) {
  window.addEventListener(GFX_EVENT, fn);
  window.addEventListener('storage', fn);
  return () => { window.removeEventListener(GFX_EVENT, fn); window.removeEventListener('storage', fn); };
}

/** The screen's own frame time, measured once while the game's menu and countdown show (little else
 *  is drawn then), so a 50 Hz screen, or a browser saving battery at 30 frames a second, isn't taken
 *  for a device that can't keep up: the quickest quarter of 40 frames, safe from a few slow ones. */
let screen = 1 / 60;
if (typeof requestAnimationFrame === 'function') {
  const at: number[] = [];
  const tick = (t: number) => {
    at.push(t);
    if (at.length < 41) { requestAnimationFrame(tick); return; }
    const gaps = at.slice(1).map((x, i) => x - at[i]).sort((a, b) => a - b);
    screen = Math.min(1 / 30, Math.max(1 / 240, gaps[10] / 1000));
  };
  requestAnimationFrame(tick);
}

/** Frame pacing for the 3D worlds (M118): fed each frame's time in seconds, it says when to draw
 *  lighter ('down') or sharper ('up'). A frame is late past 1/55 s (or a slower screen's own frame and
 *  a tenth). While the average of about a dozen frames is late as well, late frames add up, and half
 *  a second of them says 'down'; a one-off hitch or stall doesn't add up, and a frame counts at most a
 *  quarter second, so a device managing only a few frames a second (or fewer) still steps down. Two
 *  seconds faster than 80 a second (a quick screen with room) say 'up'. The first second (the last
 *  shaders and pictures going to the graphics chip) says nothing; a hidden tab pauses the world, so
 *  its gap never arrives here. */
export class Pace {
  /** Seconds played so far. */
  age = 0;
  private avg = 1 / 60;
  private slow = 0;
  private fast = 0;
  constructor(private screenFrame = () => screen) {}
  feed(raw: number): 'down' | 'up' | null {
    this.age += Math.min(1, raw);
    if (this.age < 1) return null;
    const r = Math.min(raw, 0.25), late = Math.max(1 / 55, this.screenFrame() * 1.1);
    this.avg += (r - this.avg) * 0.08;
    if (this.avg > late) { if (r > late) this.slow += r; this.fast = 0; } else if (this.avg < 1 / 80) { this.fast += r; this.slow = 0; } else this.reset();
    if (this.slow > 0.5) { this.reset(); return 'down'; }
    if (this.fast > 2) { this.reset(); return 'up'; }
    return null;
  }
  /** After a change: judge the new picture afresh. */
  reset() { this.slow = this.fast = 0; }
}

/** The sharpness the last round held 60 frames a second at with this choice (null: not found yet). */
export function fitFor(g: Gfx): number | null {
  const v = fits()[g];
  return typeof v === 'number' && v > 0 && v <= GFX_CAP[g] ? v : null;
}
export function saveFit(g: Gfx, ratio: number) {
  try { localStorage.setItem(FIT, JSON.stringify({ ...fits(), [g]: ratio })); } catch { /* private mode */ }
}
