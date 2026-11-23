import { oneLine, packagesIn, type LangInfo } from '@/lib/lab/langs';

// Hyperion's other languages (M444–): Python and R run in a sealed frame (public/sandbox/run.html, M445c), an iframe
// with sandbox="allow-scripts" and no allow-same-origin: an opaque origin of its own, so a script (one shared by link
// too) can't read the site's storage, cookies or sign-in, or call its API as the person. This side sends it a script
// and Hyperion's files, and turns what comes back into the Code window's text, error and line, figures and variables;
// only messages from that frame are read, and every field is checked. Julia, C++ and Rust run in the computer app.

export interface LangVar { name: string; size: string; cls: string; value: string }
export type LangEvent = { status: string } | { out: string; err?: boolean } | { done: true; error?: string; line?: number; figs: string[]; vars: LangVar[] };
export interface LangFile { name: string; bytes: Uint8Array }

const RUNNER = '/sandbox/run.html';
const str = (v: unknown, max = 200_000) => (typeof v === 'string' ? v.slice(0, max) : '');

export class LangRunner {
  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private onReady: (() => void) | null = null;
  private seq = 0;
  private current = 0;
  private readonly listen = (e: MessageEvent) => {
    if (!this.frame || e.source !== this.frame.contentWindow) return;
    const m = e.data as Record<string, unknown> | null;
    if (!m || typeof m !== 'object') return;
    if (m.ready === true) { this.onReady?.(); return; }
    if (m.id !== this.current) return;
    if (typeof m.status === 'string') this.on({ status: str(m.status, 300) });
    else if (typeof m.out === 'string') this.on({ out: str(m.out), err: m.err === true });
    else if (m.done === true) {
      const figs = (Array.isArray(m.figs) ? m.figs : []).filter((f): f is string => typeof f === 'string').slice(0, 20).map((f) => f.slice(0, 8_000_000));
      const vars = (Array.isArray(m.vars) ? m.vars : []).slice(0, 500).flatMap((r) => (Array.isArray(r) && r.length >= 4 ? [{ name: str(r[0], 80), size: str(r[1], 40), cls: str(r[2], 40), value: oneLine(str(r[3], 400)) }] : []));
      this.on({ done: true, error: typeof m.error === 'string' && m.error ? str(m.error, 4000) : undefined, line: typeof m.line === 'number' && m.line > 0 ? Math.floor(m.line) : undefined, figs, vars });
    }
  };

  constructor(private on: (e: LangEvent) => void) { window.addEventListener('message', this.listen); }

  private open(): Promise<void> {
    if (this.ready && this.frame) return this.ready;
    const f = document.createElement('iframe');
    f.src = RUNNER;
    f.setAttribute('sandbox', 'allow-scripts');
    f.title = 'Hyperion’s sealed runner for Python and R';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    this.ready = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('the runner didn’t start')), 30_000);
      this.onReady = () => { clearTimeout(t); resolve(); };
    });
    document.body.appendChild(f);
    this.frame = f;
    return this.ready;
  }

  run(lang: LangInfo, code: string, files: LangFile[]) {
    if (lang.id !== 'python' && lang.id !== 'r') { this.on({ done: true, error: `${lang.name} isn't ready in Hyperion yet.`, figs: [], vars: [] }); return; }
    const id = (this.current = ++this.seq);
    this.open().then(() => {
      this.frame?.contentWindow?.postMessage({ id, lang: lang.id, code, files: files.map((f) => ({ name: f.name, bytes: f.bytes })), packages: lang.id === 'r' ? packagesIn(code) : [] }, '*');
    }, (err: unknown) => { this.stop(); this.on({ done: true, error: `${lang.name} couldn't start: ${err instanceof Error ? err.message : String(err)}.`, figs: [], vars: [] }); });
  }

  /** Stop: the frame goes, and Python's and R's workspaces with it; the next run starts afresh. */
  stop() { this.frame?.remove(); this.frame = null; this.ready = null; this.onReady = null; this.current = 0; }

  dispose() { this.stop(); window.removeEventListener('message', this.listen); }
}
