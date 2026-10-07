'use client';

// Running code in code rooms (Stage 4 · 3.6), on the student's own device, never on the server.
// JavaScript runs in a throwaway Web Worker; Python in Pyodide (WebAssembly, served from /pyodide,
// scripts/copy-pyodide-assets.mjs) in a worker kept for the page, loaded on the first run. Neither
// can reach the network. A run stops after 5 s (JavaScript) or 10 s (Python, once loaded).
// The teacher's tests run after the code, in the same scope: each is a few lines that throw (or a
// failing assert) when the answer is wrong.

export interface CodeTest { name: string; code: string }
export interface TestResult { name: string; ok: boolean; message?: string }
export interface RunResult { lines: string[]; error: string | null; timedOut: boolean; tests: TestResult[] }

type Msg = { k: string; t?: string; i?: number; ok?: boolean };

function collect(tests: CodeTest[]) {
  const lines: string[] = [];
  const results: TestResult[] = tests.map((t) => ({ name: t.name, ok: false, message: 'Didn’t run' }));
  let error: string | null = null;
  const on = (m: Msg) => {
    if (m.k === 'throw') error = m.t ?? 'Error';
    else if (m.k === 'test' && typeof m.i === 'number' && results[m.i]) results[m.i] = { name: results[m.i].name, ok: !!m.ok, ...(m.ok ? {} : { message: m.t ?? 'Failed' }) };
    else if ((m.k === 'log' || m.k === 'warn' || m.k === 'error') && lines.length < 500) lines.push(m.k === 'log' ? m.t ?? '' : `${m.k}: ${m.t ?? ''}`);
  };
  return { lines, results, on, error: () => error };
}

// ── JavaScript ────────────────────────────────────────────────────────────────────────────────

export function runJavaScript(code: string, tests: CodeTest[] = []): Promise<RunResult> {
  const prelude = `const __out = (k, a) => postMessage({ k, t: a.map((x) => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); } }).join(' ') });
console.log = (...a) => __out('log', a); console.info = console.log; console.warn = (...a) => __out('warn', a); console.error = (...a) => __out('error', a);
self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.importScripts = undefined; self.indexedDB = undefined; self.caches = undefined;
const assert = (ok, message) => { if (!ok) throw new Error(message || 'Assertion failed'); };
const assertEqual = (actual, expected, message) => { const a = JSON.stringify(actual), e = JSON.stringify(expected); if (a !== e) throw new Error((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a); };
`;
  // Tests run inside the same block as the code, so they see its functions and variables.
  const checks = tests.map((t, i) => `try {\n${t.code}\n;postMessage({ k: 'test', i: ${i}, ok: true }); } catch (e) { postMessage({ k: 'test', i: ${i}, ok: false, t: String(e && e.message || e) }); }`).join('\n');
  const src = `${prelude}\ntry {\n${code}\n;${checks}\n} catch (e) { postMessage({ k: 'throw', t: String(e && e.stack || e) }); }\npostMessage({ k: 'done' });`;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const c = collect(tests);
    const finish = (timedOut: boolean) => { worker.terminate(); URL.revokeObjectURL(url); resolve({ lines: c.lines, error: c.error(), timedOut, tests: c.results }); };
    const timer = setTimeout(() => finish(true), 5000);
    worker.onmessage = (e: MessageEvent<Msg>) => { if (e.data.k === 'done') { clearTimeout(timer); finish(false); } else c.on(e.data); };
    worker.onerror = (e) => { c.on({ k: 'throw', t: e.message }); clearTimeout(timer); e.preventDefault(); finish(false); };
  });
}

// ── Python ────────────────────────────────────────────────────────────────────────────────────

const PY_WORKER = `
let py = null;
const short = (err, lines) => { const s = String(err && err.message || err).trim().split('\\n').filter(Boolean); return s.slice(-lines).join('\\n'); };
self.onmessage = async (e) => {
  const { code, tests, base } = e.data;
  try {
    if (!py) {
      const { loadPyodide } = await import(base + '/pyodide/pyodide.mjs');
      py = await loadPyodide({ indexURL: base + '/pyodide/' });
      // Loaded: from here on, no network.
      self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined;
    }
    postMessage({ k: 'ready' });
    py.setStdout({ batched: (t) => postMessage({ k: 'log', t }) });
    py.setStderr({ batched: (t) => postMessage({ k: 'warn', t }) });
    py.setStdin({ error: true });
    const ns = py.globals.get('dict')();
    let broke = false;
    try { await py.runPythonAsync(code, { globals: ns }); }
    catch (err) { broke = true; postMessage({ k: 'throw', t: short(err, 8) }); }
    for (let i = 0; i < tests.length; i++) {
      if (broke) { postMessage({ k: 'test', i, ok: false, t: 'Your code stopped with an error' }); continue; }
      try { await py.runPythonAsync(tests[i].code, { globals: ns }); postMessage({ k: 'test', i, ok: true }); }
      catch (err) { postMessage({ k: 'test', i, ok: false, t: short(err, 1) }); }
    }
    ns.destroy();
  } catch (err) { postMessage({ k: 'throw', t: 'Python couldn’t start: ' + short(err, 2) }); }
  postMessage({ k: 'done' });
};`;

let py: Worker | null = null;
let pyLoaded = false;

/** Runs Python. `onLoading` is told while Pyodide downloads (the first run only, ~12 MB). */
export function runPython(code: string, tests: CodeTest[] = [], onLoading?: (loading: boolean) => void): Promise<RunResult> {
  return new Promise((resolve) => {
    if (!py) {
      const url = URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' }));
      py = new Worker(url, { type: 'module' });
      URL.revokeObjectURL(url);
      pyLoaded = false;
    }
    const worker = py;
    const c = collect(tests);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (timedOut: boolean) => {
      if (timer) clearTimeout(timer);
      worker.onmessage = null;
      // A run that went on too long: the worker is stopped and Python loads again next time.
      if (timedOut) { worker.terminate(); if (py === worker) py = null; }
      onLoading?.(false);
      resolve({ lines: c.lines, error: c.error(), timedOut, tests: c.results });
    };
    if (!pyLoaded) onLoading?.(true);
    // Loading can take a while on a slow connection; the 10 s limit starts once Python is ready.
    timer = setTimeout(() => finish(true), 120_000);
    worker.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data.k === 'ready') {
        pyLoaded = true;
        onLoading?.(false);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => finish(true), 10_000);
      } else if (e.data.k === 'done') finish(false);
      else c.on(e.data);
    };
    worker.onerror = (e) => { c.on({ k: 'throw', t: e.message || 'Python stopped' }); e.preventDefault(); worker.terminate(); if (py === worker) py = null; finish(false); };
    worker.postMessage({ code, tests, base: location.origin });
  });
}

export const canRun = (lang: string) => lang === 'javascript' || lang === 'python';
