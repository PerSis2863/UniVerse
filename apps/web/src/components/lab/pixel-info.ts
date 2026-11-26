// impixelinfo (M561): with it on for a figure, the pointer over a picture shows the pixel's column, row and colour
// under the figure. The picture is the <image> the engine drew (src/lib/lab/plot3d.ts, data-px="W H flipped"); its
// PNG is decoded once into a canvas and read where the pointer is. The colour is the one shown (for an RGB or grey
// uint8 picture, its own values).

const decoded = new Map<string, Promise<ImageData | null>>();
function pixelsOf(href: string) {
  let p = decoded.get(href);
  if (!p) {
    p = (async () => {
      try {
        // An <img>, not fetch: the site's policy lets pictures load from data: addresses, not connections.
        const el = new Image();
        el.src = href;
        await el.decode();
        const bmp = await createImageBitmap(el);
        const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height);
      } catch { return null; }
    })();
    if (decoded.size > 8) decoded.delete(decoded.keys().next().value!);
    decoded.set(href, p);
  }
  return p;
}

/** The readout for the pointer at (x, y) on the page over `target`, or null when it isn't over a picture. */
export async function pixelAt(target: EventTarget | null, x: number, y: number): Promise<string | null> {
  const el = target instanceof Element ? target.closest('image[data-px]') : null;
  if (!el || !el.closest('svg[data-pixelinfo]')) return null;
  const [w, h, flipped] = (el.getAttribute('data-px') ?? '').split(' ').map(Number);
  const r = el.getBoundingClientRect();
  if (!w || !h || !r.width || !r.height) return null;
  const col = Math.min(w - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * w)));
  const shown = Math.min(h - 1, Math.max(0, Math.floor(((y - r.top) / r.height) * h)));
  const href = el.getAttribute('href') ?? '';
  const data = href.startsWith('data:image/') ? await pixelsOf(href) : null;
  const row = flipped ? h - 1 - shown : shown;
  if (!data) return `(X, Y) = (${col + 1}, ${row + 1})`;
  const o = (shown * data.width + col) * 4, [R, G, B] = [data.data[o], data.data[o + 1], data.data[o + 2]];
  return `(X, Y) = (${col + 1}, ${row + 1})   ${R === G && G === B ? `${R}` : `[${R} ${G} ${B}]`}`;
}
