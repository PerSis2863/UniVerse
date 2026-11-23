import { oneLine } from '@/lib/lab/langs';
import type { LangEvent, LangFile } from './lang-runner';

// Hyperion's R (M445, the owner, 23 Nov: "R (with ggplot2)"): webR, R compiled for the browser. Its own code starts R in
// a background thread of its own; this side hands it scripts. Loaded the first time an .R script runs, from webR's own
// versioned folder (the only place the site's security policy allows); packages a script loads with library(…),
// require(…) or pkg:: are fetched from webR's package repository the first time. Figures come back as pictures.

export const WEBR = 'https://webr.r-wasm.org/v0.6.0/';

interface RObj { toJs(): Promise<{ values?: unknown[] }> }
interface Shelter {
  captureR(code: string, o: Record<string, unknown>): Promise<{ output: { type: string; data: unknown }[]; images: ImageBitmap[] }>;
  evalR(code: string): Promise<RObj>;
  purge(): Promise<void>;
}
interface WebR {
  init(): Promise<void>;
  close(): void;
  installPackages(pkgs: string[], o?: { quiet?: boolean }): Promise<void>;
  evalRBoolean(code: string): Promise<boolean>;
  FS: { writeFile(path: string, data: Uint8Array): Promise<void> };
  Shelter: new () => Promise<Shelter>;
}

/** The packages a script asks for: library(x), require(x), requireNamespace("x"), x::f. */
export function packagesIn(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/\b(?:library|require|requireNamespace)\s*\(\s*["']?([A-Za-z][\w.]*)["']?/g)) out.add(m[1]);
  for (const m of code.matchAll(/\b([A-Za-z][\w.]*):::?[A-Za-z_.]/g)) out.add(m[1]);
  for (const base of ['base', 'stats', 'utils', 'graphics', 'grDevices', 'methods', 'datasets', 'tools', 'grid', 'splines', 'parallel', 'compiler', 'tcltk', 'stats4', 'webr']) out.delete(base);
  return [...out].slice(0, 20);
}

/** A picture as an SVG that holds it (so the figure panel, PNG and SVG downloads treat every language alike). */
async function asSvg(img: ImageBitmap): Promise<string> {
  const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, img.width, img.height); g.drawImage(img, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' }), bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}" viewBox="0 0 ${img.width} ${img.height}"><image width="${img.width}" height="${img.height}" href="data:image/png;base64,${btoa(bin)}"/></svg>`;
}

/** The workspace's variables: name, size, class and the first line of str(). */
const VARS = `local({
  nm <- ls(globalenv())
  vapply(nm, function(n) {
    v <- get(n, envir = globalenv())
    d <- if (is.null(dim(v))) as.character(length(v)) else paste(dim(v), collapse = "\\u00d7")
    s <- tryCatch(paste(utils::capture.output(utils::str(v, max.level = 1, give.attr = FALSE, vec.len = 3))[1], collapse = " "), error = function(e) "")
    paste(n, d, class(v)[1], s, sep = "\\t")
  }, "")
})`;

export class RRunner {
  private r: Promise<WebR> | null = null;
  constructor(private on: (e: LangEvent) => void) {}

  private load(): Promise<WebR> {
    if (this.r) return this.r;
    this.r = (async () => {
      this.on({ status: 'Loading R (once a visit, about 20 MB)…' });
      const mod = (await import(/* webpackIgnore: true */ `${WEBR}webr.mjs`)) as { WebR: new (o: Record<string, unknown>) => WebR; ChannelType: { PostMessage: number } };
      const w = new mod.WebR({ baseUrl: WEBR, channelType: mod.ChannelType.PostMessage, interactive: false });
      await w.init();
      return w;
    })();
    this.r.catch(() => { this.r = null; });
    return this.r;
  }

  async run(code: string, files: LangFile[]) {
    let w: WebR;
    try { w = await this.load(); } catch (err) { this.on({ done: true, error: `R couldn't load: ${err instanceof Error ? err.message : String(err)}. Check the connection and try again.`, figs: [], vars: [] }); return; }
    for (const f of files) await w.FS.writeFile(`/home/web_user/${f.name}`, f.bytes).catch(() => {});
    const missing: string[] = [];
    for (const p of packagesIn(code)) if (!(await w.evalRBoolean(`requireNamespace("${p}", quietly = TRUE)`).catch(() => false))) missing.push(p);
    if (missing.length) {
      this.on({ status: `Loading ${missing.join(', ')} (once a visit)…` });
      await w.installPackages(missing, { quiet: true }).catch(() => {});
    }
    // ggplot2 draws its text at 11 pt whatever the device says: a little larger here, to read in the figure panel.
    if (/\bggplot2\b/.test(code)) await w.evalRBoolean('if (requireNamespace("ggplot2", quietly = TRUE) && !isTRUE(getOption("hyperion.gg"))) { ggplot2::theme_set(ggplot2::theme_grey(base_size = 16)); options(hyperion.gg = TRUE) }; TRUE').catch(() => false);
    const shelter = await new w.Shelter();
    let error: string | undefined, line: number | undefined;
    const figs: string[] = [];
    try {
      const cap = await shelter.captureR(code, { withAutoprint: true, captureStreams: true, captureConditions: false, captureGraphics: { width: 640, height: 460, bg: 'white', pointsize: 16 } });
      let text = '';
      for (const o of cap.output) if (o.type === 'stdout' || o.type === 'stderr') text += `${String(o.data)}\n`;
      if (text) this.on({ out: text });
      for (const img of cap.images) figs.push(await asSvg(img));
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).replace(/^Error:\s*/, '');
      const at = /<text>:(\d+):/.exec(error);
      if (at) line = Number(at[1]);
    }
    let vars: { name: string; size: string; cls: string; value: string }[] = [];
    try {
      const rows = ((await (await shelter.evalR(VARS)).toJs()).values ?? []) as string[];
      vars = rows.map((r) => { const [name, size, cls, value] = r.split('\t'); return { name, size, cls, value: oneLine(value ?? '') }; });
    } catch { /* the workspace couldn't be listed */ }
    await shelter.purge().catch(() => {});
    this.on({ done: true, error, line, figs, vars });
  }

  /** Stop: R closes (its workspace with it); the next run starts it again. */
  stop() { void this.r?.then((w) => w.close()).catch(() => {}); this.r = null; }
}
