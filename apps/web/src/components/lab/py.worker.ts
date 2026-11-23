/// <reference lib="webworker" />
import { oneLine } from '@/lib/lab/langs';

// Hyperion's Python (M444, the owner, 23 Nov): Pyodide, CPython compiled for the browser, in its own background thread.
// Loaded the first time a .py script runs, from Pyodide's own folder on jsDelivr (the only place the site's security
// policy lets it come from); NumPy, SciPy, Pandas, Matplotlib and the rest of Pyodide's packages are fetched when a
// script imports them. Nothing is installed on the computer and nothing leaves it: the code runs here. Variables stay
// between runs (one workspace), figures come back as SVG, and Hyperion's files are in the working folder.

export const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/';
export type ToPy = { run: string; id: number } | { upload: { name: string; bytes: Uint8Array }[] };
export type FromPy =
  | { status: string }
  | { out: string; err?: boolean }
  | { done: number; error?: string; line?: number; figs: string[]; vars: { name: string; size: string; cls: string; value: string }[] };

interface Pyodide {
  runPythonAsync(code: string, o?: { globals?: unknown; filename?: string }): Promise<unknown>;
  runPython(code: string, o?: { globals?: unknown }): unknown;
  loadPackagesFromImports(code: string, o?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  setStdout(o: { batched: (s: string) => void }): void;
  setStderr(o: { batched: (s: string) => void }): void;
  globals: { get(name: string): unknown };
  FS: { writeFile(path: string, data: Uint8Array): void; mkdirTree(path: string): void };
}

let py: Promise<Pyodide> | null = null;
const post = (m: FromPy) => postMessage(m);
let waiting: { name: string; bytes: Uint8Array }[] = [];

/** Python's own bookkeeping after each run: the figures as SVG (then closed) and the workspace's variables. */
const AFTER = `
def __hy_after():
    import io, json, sys
    figs = []
    if 'matplotlib.pyplot' in sys.modules:
        plt = sys.modules['matplotlib.pyplot']
        for n in plt.get_fignums():
            b = io.StringIO()
            plt.figure(n).savefig(b, format='svg', bbox_inches='tight')
            figs.append(b.getvalue())
        plt.close('all')
    rows = []
    for k, v in list(globals().items()):
        if k.startswith('_') or type(v).__name__ in ('module', 'function', 'builtin_function_or_method', 'type', 'method'):
            continue
        shape = getattr(v, 'shape', None)
        if isinstance(shape, tuple):
            size = '×'.join(str(s) for s in shape) or '1'
        elif hasattr(v, '__len__') and not isinstance(v, str):
            size = str(len(v))
        else:
            size = '1'
        try:
            r = repr(v)
        except Exception:
            r = '…'
        rows.append([k, size, type(v).__name__, r[:400]])
    return json.dumps({'figs': figs, 'vars': rows})
`;

function load(): Promise<Pyodide> {
  if (py) return py;
  py = (async () => {
    post({ status: 'Loading Python (once a visit, about 15 MB)…' });
    const mod = (await import(/* webpackIgnore: true */ `${PYODIDE}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<Pyodide> };
    const p = await mod.loadPyodide({ indexURL: PYODIDE });
    p.setStdout({ batched: (s) => post({ out: `${s}\n` }) });
    p.setStderr({ batched: (s) => post({ out: `${s}\n`, err: true }) });
    // Figures are drawn off screen (there is no window in a background thread) and come back as SVG.
    p.runPython("import os, warnings\nos.environ['MPLBACKEND'] = 'AGG'\nwarnings.filterwarnings('ignore', message='.*non-interactive.*')\n" + AFTER);
    p.FS.mkdirTree('/home/pyodide');
    return p;
  })();
  py.catch(() => { py = null; });
  return py;
}

/** Python's error, its last lines (the kind and the message) and the script's line it happened on. */
function pyError(e: unknown): { error: string; line?: number } {
  const text = e instanceof Error ? e.message : String(e);
  const lines = text.trim().split('\n');
  const at = [...text.matchAll(/File "<exec>", line (\d+)/g)].pop();
  const k = lines.findLastIndex((l) => /^\w*(Error|Exception|Exit|Interrupt)\b/.test(l));
  const tail = k >= 0 ? lines.slice(k).join('\n') : lines[lines.length - 1];
  return { error: tail, line: at ? Number(at[1]) : undefined };
}

self.onmessage = async (e: MessageEvent<ToPy>) => {
  const m = e.data;
  if ('upload' in m) {
    waiting = [...waiting.filter((w) => !m.upload.some((u) => u.name === w.name)), ...m.upload];
    if (py) { const p = await py; for (const f of waiting) p.FS.writeFile(`/home/pyodide/${f.name}`, f.bytes); waiting = []; }
    return;
  }
  let p: Pyodide;
  try { p = await load(); } catch (err) { post({ done: m.id, error: `Python couldn't load: ${err instanceof Error ? err.message : String(err)}. Check the connection and try again.`, figs: [], vars: [] }); return; }
  for (const f of waiting) p.FS.writeFile(`/home/pyodide/${f.name}`, f.bytes);
  waiting = [];
  let error: { error: string; line?: number } | null = null;
  try {
    await p.loadPackagesFromImports(m.run, { messageCallback: (s) => { if (/^Loading /.test(s)) post({ status: s.replace(/^Loading /, 'Loading ') }); }, errorCallback: () => {} });
    await p.runPythonAsync(m.run, { filename: '<exec>' });
  } catch (err) { error = pyError(err); }
  let figs: string[] = [], vars: { name: string; size: string; cls: string; value: string }[] = [];
  try {
    const after = JSON.parse(String(p.runPython('__hy_after()'))) as { figs: string[]; vars: [string, string, string, string][] };
    figs = after.figs;
    vars = after.vars.map(([name, size, cls, value]) => ({ name, size, cls, value: oneLine(value) }));
  } catch { /* the workspace couldn't be read: keep the run's own answer */ }
  post({ done: m.id, ...(error ?? {}), figs, vars });
};
