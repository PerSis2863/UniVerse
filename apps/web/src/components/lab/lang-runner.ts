import { oneLine, packagesIn, type LangInfo } from '@/lib/lab/langs';

// Hyperion's other languages (M444–): Python and R run in a sealed frame (public/sandbox/run.html, M445c), an iframe
// with sandbox="allow-scripts" and no allow-same-origin: an opaque origin of its own, so a script (one shared by link
// too) can't read the site's storage, cookies or sign-in, or call its API as the person. This side sends it a script
// and Hyperion's files, and turns what comes back into the Code window's text, error and line, figures and variables;
// only messages from that frame are read, and every field is checked. Julia, C++ and Rust run in the computer app
// (M446), which asks the person before a program runs on their computer.

export interface LangVar { name: string; size: string; cls: string; value: string }
export type LangEvent = { status: string } | { out: string; err?: boolean } | { done: true; error?: string; line?: number; figs: string[]; vars: LangVar[] };
export interface LangFile { name: string; bytes: Uint8Array }

const RUNNER = '/sandbox/run.html';

/** The computer app's bridge (desktop/hyperion/preload.js, M446): absent in a browser. */
interface Desktop {
  run(lang: string, code: string): Promise<{ ok: boolean; exitCode?: number; error?: string; missing?: boolean; cancelled?: boolean; ms?: number }>;
  stop(): Promise<void>;
  onOutput(cb: (text: string, isError: boolean) => void): () => void;
}
const desktop = (): Partial<Desktop> | undefined => (typeof window === 'undefined' ? undefined : (window as Window & { hyperionDesktop?: Partial<Desktop> }).hyperionDesktop);
/** The line a compiler or Julia names in its first error (main.cpp:12:5: error / --> main.rs:12:5 / main.jl:12). */
export function errorLine(lang: 'julia' | 'cpp' | 'rust', text: string): number | undefined {
  const m = lang === 'cpp' ? /main\.cpp:(\d+):\d+:\s*(?:fatal )?error/.exec(text) : lang === 'rust' ? /-->\s*main\.rs:(\d+):\d+/.exec(text) : /main\.jl:(\d+)/.exec(text);
  return m ? Number(m[1]) : undefined;
}
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
    if (lang.id === 'julia' || lang.id === 'cpp' || lang.id === 'rust') { this.native(lang.id, lang.name, code); return; }
    if (lang.id !== 'python' && lang.id !== 'r') { this.on({ done: true, error: `${lang.name} isn't ready in Hyperion yet.`, figs: [], vars: [] }); return; }
    const id = (this.current = ++this.seq);
    this.open().then(() => {
      this.frame?.contentWindow?.postMessage({ id, lang: lang.id, code, files: files.map((f) => ({ name: f.name, bytes: f.bytes })), packages: lang.id === 'r' ? packagesIn(code) : [] }, '*');
    }, (err: unknown) => { this.stop(); this.on({ done: true, error: `${lang.name} couldn't start: ${err instanceof Error ? err.message : String(err)}.`, figs: [], vars: [] }); });
  }

  /** Julia, C++ and Rust: built and run by the tools on the person's computer, through the computer app (M446). */
  private native(lang: 'julia' | 'cpp' | 'rust', name: string, code: string) {
    const d = desktop();
    if (!d?.run || !d.onOutput) {
      this.on({ done: true, error: `${name} runs in Hyperion's computer app, with the ${name} installed on your computer. Get the app with Install Hyperion at the top (Windows, Mac or Linux), then open this script there.`, figs: [], vars: [] });
      return;
    }
    const id = (this.current = ++this.seq);
    let printed = '';
    const off = d.onOutput((text, err) => { if (this.current !== id) return; printed = (printed + text).slice(-200_000); this.on({ out: text, err }); });
    this.on({ status: lang === 'julia' ? 'Running with Julia on this computer…' : `Building with the ${name} compiler on this computer…` });
    d.run(lang, code).then((r) => {
      off();
      if (this.current !== id) return;
      this.on({ done: true, error: r.ok ? undefined : str(r.error, 2000) || `${name} stopped.`, line: r.ok ? undefined : errorLine(lang, printed), figs: [], vars: [] });
    }, (err: unknown) => { off(); this.on({ done: true, error: err instanceof Error ? err.message : String(err), figs: [], vars: [] }); });
  }

  /** Stop: the frame goes, and Python's and R's workspaces with it; a program on the computer is stopped too. */
  stop() { void desktop()?.stop?.(); this.frame?.remove(); this.frame = null; this.ready = null; this.onReady = null; this.current = 0; }

  dispose() { this.stop(); window.removeEventListener('message', this.listen); }
}
