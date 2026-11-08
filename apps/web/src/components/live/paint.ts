// What the live cards share (M48): their colours, the soft glow they stamp and a little maths. No
// React here and nothing of the page but making a canvas, so a card can also be drawn on a
// background thread (the planet, M85: planet.worker.ts), where sprites are OffscreenCanvases.

/** The light (M52, the "Globynk" palette): Baby Pink, Aqua Jade, a periwinkle blue and a cool white. */
// shortcut: the keys keep their M52 names; since M91 (the photos' look) "aqua" is warm gold and "blue" steel.
export const TONES = { pink: '79,142,247', blue: '150,180,208', aqua: '240,204,138', white: '244,244,245' } as const;
export type Tone = keyof typeof TONES;
export const TONE_ORDER: Tone[] = ['pink', 'blue', 'aqua', 'white'];

export type Surface = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A small canvas to draw a sprite into: a page canvas, or an OffscreenCanvas on a background thread. */
export function sprite(w: number, h: number): [Surface, Ctx2D] {
  if (typeof document === 'undefined') { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d')!]; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

const sprites = new Map<string, Surface>();
/** A soft round glow in one colour, drawn once and stamped many times (cheap: no shadows, no blur). */
export function glow(tone: Tone): Surface {
  let s = sprites.get(tone);
  if (s) return s;
  const [c, g] = sprite(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${TONES[tone]},1)`);
  gr.addColorStop(0.18, `rgba(${TONES[tone]},0.55)`);
  gr.addColorStop(0.5, `rgba(${TONES[tone]},0.12)`);
  gr.addColorStop(1, `rgba(${TONES[tone]},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  sprites.set(tone, (s = c));
  return s;
}

/** A repeatable random number in [0, 1) for a seed (the same picture every time for the same data). */
export const seeded = (n: number) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Ease out (fast start, soft landing), for arrivals. */
export const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
