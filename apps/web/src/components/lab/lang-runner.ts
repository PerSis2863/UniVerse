import type { LangInfo } from '@/lib/lab/langs';
import type { FromPy, ToPy } from './py.worker';
import type { RRunner } from './r-runner';

// Hyperion's other languages (M444–): one runner per language, each in its own background thread (Python, R) or in the
// computer app (Julia, C++, Rust). The Code window hands it a script and gets back what it printed, its error and line,
// its figures (SVG) and its variables.

export interface LangVar { name: string; size: string; cls: string; value: string }
export type LangEvent = { status: string } | { out: string; err?: boolean } | { done: true; error?: string; line?: number; figs: string[]; vars: LangVar[] };
export interface LangFile { name: string; bytes: Uint8Array }

export class LangRunner {
  private py: Worker | null = null;
  private seq = 0;
  private rr: RRunner | null = null;
  constructor(private on: (e: LangEvent) => void) {}

  private python() {
    if (this.py) return this.py;
    const w = new Worker(new URL('./py.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromPy>) => {
      const m = e.data;
      if ('done' in m) this.on({ done: true, error: m.error, line: m.line, figs: m.figs, vars: m.vars });
      else this.on(m);
    };
    w.onerror = () => { this.on({ done: true, error: 'Python stopped unexpectedly. Run again to start it afresh.', figs: [], vars: [] }); this.stop(); };
    return (this.py = w);
  }

  run(lang: LangInfo, code: string, files: LangFile[]) {
    if (lang.id === 'python') {
      const w = this.python();
      if (files.length) w.postMessage({ upload: files.map((f) => ({ name: f.name, bytes: f.bytes })) } satisfies ToPy);
      w.postMessage({ run: code, id: ++this.seq } satisfies ToPy);
      return;
    }
    if (lang.id === 'r') {
      // R's code is only fetched the first time an R script runs.
      void (async () => {
        if (!this.rr) { const { RRunner } = await import('./r-runner'); this.rr ??= new RRunner(this.on); }
        await this.rr.run(code, files);
      })().catch((err) => this.on({ done: true, error: err instanceof Error ? err.message : String(err), figs: [], vars: [] }));
      return;
    }
    this.on({ done: true, error: `${lang.name} isn't ready in Hyperion yet.`, figs: [], vars: [] });
  }

  /** Stop: the language's thread ends (its workspace with it); the next run starts it again. */
  stop() { this.py?.terminate(); this.py = null; this.rr?.stop(); }
}
