'use client';

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { BookOpen, Copy, Download, File as FileIcon, FilePlus2, FileCode2, Image as ImageIcon, Play, Square, Trash2, Upload } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import type { FigOut, FileIn, FromLab, Inspect, ToLab, VarRow } from './lab.worker';
import { VariableViewer, type Shown } from './VariableViewer';
import { FunctionBrowser } from './FunctionBrowser';
import { HELP } from '@/lib/lab/help';
import { forget, keep, keptFiles, MAX_FILE, pixelsOf, sizeText } from './lab-files';
import { controlsOf, setControl, type Control } from '@/lib/lab/controls';
import { LabEditor } from './LabEditor';
import { builtinNames } from './matlab-lang';

// M376: Hyperion's window: the command window, a script editor, the variables and the figures, like a desktop
// maths program. The engine (src/lib/lab) runs in a background worker (lab.worker.ts): the page never freezes and
// Stop ends a run. Scripts are kept on this device, and so are files (M383: uploaded, or written by code; IndexedDB).
// Phones get the same parts as tabs.

type Line = { k: 'in' | 'out' | 'err'; t: string };
type Tab = 'command' | 'editor' | 'variables' | 'files' | 'figure';
const TABS: Tab[] = ['command', 'editor', 'variables', 'files', 'figure'];
type From = 'cmd' | 'script' | 'live';
interface Script { name: string; code: string }
const KEEP = 'uv-lab-scripts';
const EXAMPLES: Script[] = [
  { name: 'first_plot.m', code: "% A first plot: press Run (or Ctrl+Enter)\nx = linspace(0, 2*pi, 200);\nplot(x, sin(x), x, cos(x), '--')\ntitle('sin and cos')\nxlabel('x'); grid on\nlegend('sin', 'cos')\n" },
  { name: 'matrices.m', code: "% Solve A x = b\nA = [4 -2 1; -2 4 -2; 1 -2 4];\nb = [11; -16; 17];\nx = A \\ b\ncheck = A * x - b\nd = det(A)\n" },
  { name: 'spring.m', code: "% A damped spring with ode45\nf = @(t, y) [y(2); -4*y(1) - 0.5*y(2)];\n[t, y] = ode45(f, [0 20], [1; 0]);\nplot(t, y(:, 1)); grid on\ntitle('Position over time'); xlabel('t (s)'); ylabel('x (m)')\n" },
  { name: 'fit.m', code: "% Fit a line to measurements\nx = 0:10;\ny = 2.5*x + 1 + randn(1, 11);\np = polyfit(x, y, 1)\nscatter(x, y); hold on\nplot(x, polyval(p, x), 'r'); hold off\nlegend('data', 'fit'); title(sprintf('y = %.2f x + %.2f', p(1), p(2)))\n" },
  { name: 'waves.m', code: "% Live controls: drag them and the figure follows\nfreq = 2;        % slider 0.5 8\ndamping = 0.3;   % slider 0 1\nshape = 'sine';  % menu sine square sawtooth\nshowEnvelope = true; % toggle\nt = linspace(0, 10, 600);\nswitch shape\n  case 'sine', y = sin(2*pi*freq*t/5);\n  case 'square', y = sign(sin(2*pi*freq*t/5));\n  otherwise, y = 2*mod(freq*t/5, 1) - 1;\nend\ny = y .* exp(-damping*t);\nplot(t, y); hold on\nif showEnvelope, plot(t, exp(-damping*t), '--', t, -exp(-damping*t), '--'); end\nhold off; ylim([-1.2 1.2]); grid on\ntitle(sprintf('%s wave, f = %.1f', shape, freq))\n" },
  { name: 'surface.m', code: "% A surface you can turn, and its contours\n[X, Y, Z] = peaks(40);\nsubplot(1, 2, 1)\nsurf(X, Y, Z); shading interp; colorbar\ntitle('peaks'); xlabel('x'); ylabel('y')\nview(-30, 35)\nsubplot(1, 2, 2)\ncontourf(X, Y, Z, 12)\ntitle('from above')\n" },
];
const read = (): Script[] => { try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); return Array.isArray(v) && v.length ? v : EXAMPLES; } catch { return EXAMPLES; } };
const lineOf = (code: string, at: number) => code.slice(0, at).split('\n').length;

export function LabApp() {
  const dark = useDarkMode(), wide = useMedia('(min-width: 1024px)');
  const kept = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(KEEP) ?? ''; } catch { return ''; } }, () => '');
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const list = scripts ?? (kept ? read() : EXAMPLES);
  const [open, setOpen] = useState(0);
  const [log, setLog] = useState<Line[]>([{ k: 'out', t: 'Hyperion: type a command and press Enter, or run a script. Try  x = magic(4)  or  plot(1:10)\n' }]);
  const [vars, setVars] = useState<VarRow[]>([]);
  const [figs, setFigs] = useState<FigOut[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmd, setCmd] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [tab, setTabNow] = useState<Tab>('command');
  const [tabDir, setTabDir] = useState<'next' | 'back'>('next');
  const setTab = (t: Tab | ((old: Tab) => Tab)) => setTabNow((old) => { const n = typeof t === 'function' ? t(old) : t; if (n !== old) setTabDir(TABS.indexOf(n) > TABS.indexOf(old) ? 'next' : 'back'); return n; });
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [namesVersion, setNamesVersion] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const looking = useRef<Inspect | null>(null);
  const [codeError, setCodeError] = useState<{ line: number; message: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileData = useRef(new Map<string, FileIn>());
  const picker = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; code: string; from: From } | null>(null);
  const busyNow = useRef(false), queued = useRef<string | null>(null), lastLiveError = useRef('');
  const keepTimer = useRef(0);
  const logBox = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Saved a moment after the last change (a slider sends many changes a second).
  const save = (next: Script[]) => { setScripts(next); clearTimeout(keepTimer.current); keepTimer.current = window.setTimeout(() => { try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } }, 250); };
  const print = (l: Line) => setLog((prev) => {
    if (l.t.includes('\f')) return [{ ...l, t: l.t.slice(l.t.lastIndexOf('\f') + 1) }].filter((x) => x.t);
    return [...prev.slice(-800), l];
  });

  const run = (code: string, from: From) => {
    if (busyNow.current || !code.trim() || !worker.current) return;
    const id = ++seq.current;
    pending.current = { id, code, from };
    busyNow.current = true;
    setBusy(true);
    if (from !== 'live') print({ k: 'in', t: from === 'cmd' ? code : `>> run ${list[open]?.name ?? 'script'}` });
    worker.current.postMessage({ run: code, id } satisfies ToLab);
  };  const start = () => {
    const w = new Worker(new URL('./lab.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromLab>) => {
      const m = e.data;
      // A live run (a control moved) keeps the command window quiet: the figure and variables show the change.
      if ('out' in m) { if (pending.current?.from !== 'live') print({ k: 'out', t: m.out }); return; }
      if ('fig' in m) { setFigs((fs) => fs.map((f) => (f.id === m.fig.id ? m.fig : f))); return; }
      if ('names' in m) { for (const n of m.names) builtinNames.add(n); setNamesVersion((v) => v + 1); return; }
      if ('view' in m) { if (looking.current) setShown(m.view); return; }
      const p = pending.current;
      const errText = m.error ? `Error${p?.from !== 'cmd' && m.at !== undefined && p ? ` (line ${lineOf(p.code, m.at)})` : ''}: ${m.error}\n` : '';
      if (m.error && !(p?.from === 'live' && errText === lastLiveError.current)) print({ k: 'err', t: errText });
      lastLiveError.current = errText; // a live run repeating the same error stays quiet
      // A script's error is marked on its line in the editor (until the code changes).
      setCodeError(m.error && p && p.from !== 'cmd' && m.at !== undefined ? { line: lineOf(p.code, m.at), message: m.error } : null);
      setVars(m.vars);
      // Files the code wrote or deleted: kept on this device (or forgotten).
      for (const f of m.files) {
        if (f.bytes) { fileData.current.set(f.name, { name: f.name, bytes: f.bytes, pixels: f.pixels }); void keep(f.name, f.bytes); }
        else { fileData.current.delete(f.name); void forget(f.name); }
      }
      if (m.files.length) listFiles();
      // Figures only come back when a run changed them (null: keep what's shown).
      if (m.figs) { setFigs(m.figs); setCurrent(m.current); asked.current = ''; if (m.figs.length) setTab((t) => (t === 'editor' && p?.from === 'script' ? 'figure' : t)); }
      pending.current = null;
      busyNow.current = false;
      setBusy(false);
      // An open variable viewer follows the change (an edit made in it, or any other run).
      if (looking.current) w.postMessage({ inspect: looking.current } satisfies ToLab);
      // The newest position of a control, if it moved while that run was going.
      const next = queued.current;
      if (next !== null) { queued.current = null; run(next, 'live'); }
    };
    worker.current = w;
    // A restarted engine (after Stop) gets the files again.
    if (fileData.current.size) w.postMessage({ upload: [...fileData.current.values()] } satisfies ToLab);
  };
  const listFiles = () => setFiles([...fileData.current.values()].map((f) => ({ name: f.name, size: f.bytes.length })).sort((a, b) => a.name.localeCompare(b.name)));
  const restore = useEffectEvent(async () => {
    const kept = await keptFiles();
    const list = await Promise.all(kept.map(async (k): Promise<FileIn> => ({ name: k.name, bytes: k.bytes, pixels: (await pixelsOf(k.name, k.bytes)) ?? undefined })));
    for (const f of list) fileData.current.set(f.name, f);
    if (list.length) { worker.current?.postMessage({ upload: list } satisfies ToLab); listFiles(); }
  });
  useEffect(() => { void restore(); }, []);
  const addFiles = async (picked: FileList | File[]) => {
    const added: FileIn[] = [];
    for (const file of Array.from(picked)) {
      if (file.size > MAX_FILE) { toast.error(`${file.name} is over 50 MB.`); continue; }
      const name = file.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const f: FileIn = { name, bytes, pixels: (await pixelsOf(name, bytes)) ?? undefined };
      fileData.current.set(name, f);
      void keep(name, bytes);
      added.push(f);
    }
    if (!added.length) return;
    worker.current?.postMessage({ upload: added } satisfies ToLab);
    listFiles();
    toast.success(added.length === 1 ? `${added[0].name} is ready: use it by name, like readmatrix('${added[0].name}').` : `${added.length} files are ready.`);
  };
  /** A function's help for the editor (beside suggestions and on hover). */
  const describe = (n: string) => { const e = HELP.get(n); return e ? `${e.syntax}\n${e.text}` : undefined; };
  /** The variable viewer: open a variable (or a part of it), go further in, page through. */
  const inspect = (q: Inspect | null) => { looking.current = q; if (!q) { setShown(null); return; } worker.current?.postMessage({ inspect: q } satisfies ToLab); };
  const removeFile = (name: string) => {
    if (!confirm(`Delete ${name} from your Hyperion files?`)) return;
    fileData.current.delete(name); void forget(name);
    worker.current?.postMessage({ remove: name } satisfies ToLab);
    listFiles();
  };
  const boot = useEffectEvent(() => start());
  useEffect(() => { boot(); return () => worker.current?.terminate(); }, []);
  useEffect(() => { logBox.current?.scrollTo({ top: logBox.current.scrollHeight }); }, [log]);


  const stop = () => {
    worker.current?.terminate(); start();
    setBusy(false); setVars([]); pending.current = null; busyNow.current = false; queued.current = null;
    print({ k: 'err', t: 'Stopped. The variables were cleared (the engine was restarted).\n' });
  };
  /** Tab in the command window: finish the word (functions, variables, files), or list what it could be. */
  const complete = (box: HTMLTextAreaElement) => {
    const at = box.selectionStart, before = cmd.slice(0, at), word = /[\w.]*$/.exec(before)![0];
    if (!word) return;
    const quoted = /'[^']*$/.test(before);
    const pool = quoted ? files.map((f) => f.name) : [...vars.map((v) => v.name), ...builtinNames];
    const hits = [...new Set(pool)].filter((n) => n.startsWith(word)).sort();
    if (!hits.length) return;
    let common = hits[0];
    for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
    if (common.length > word.length || hits.length === 1) {
      const next = before.slice(0, at - word.length) + (hits.length === 1 ? hits[0] : common) + cmd.slice(at);
      setCmd(next);
      const caret = at - word.length + (hits.length === 1 ? hits[0] : common).length;
      requestAnimationFrame(() => { box.selectionStart = box.selectionEnd = caret; });
    } else print({ k: 'out', t: `${hits.slice(0, 60).join('   ')}${hits.length > 60 ? `   … ${hits.length - 60} more` : ''}\n` });
  };
  const send = () => { const c = cmd; if (!c.trim()) return; setHist((h) => [...h.filter((x) => x !== c), c].slice(-100)); setHi(-1); setCmd(''); run(c, 'cmd'); };

  const fig = figs.find((f) => f.id === current) ?? figs[figs.length - 1] ?? null;
  // The figure is drawn at its panel's real size (sharp text), again whenever the panel changes size.
  const figBox = useRef<HTMLDivElement | null>(null), asked = useRef('');
  const figId = fig?.id;
  useEffect(() => {
    const el = figBox.current;
    if (!el || figId === undefined) return;
    let t = 0;
    const ask = () => {
      const w = Math.round(el.clientWidth - 16), h = Math.round(Math.min(el.clientHeight - 16, w * 0.8));
      const key = `${figId}:${w}x${h}`;
      if (w < 200 || h < 160 || key === asked.current) return;
      asked.current = key;
      worker.current?.postMessage({ figure: figId, w, h } satisfies ToLab);
    };
    const ro = new ResizeObserver(() => { clearTimeout(t); t = window.setTimeout(ask, 120); });
    ro.observe(el); ask();
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [figId, tab, wide]);
  const svg = fig ? (dark ? fig.dark : fig.light) : '';
  const download = (name: string, body: BlobPart, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const png = async () => {
    if (!fig) return;
    const img = new Image(), url = URL.createObjectURL(new Blob([fig.light], { type: 'image/svg+xml' }));
    img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2;
    const ctx = c.getContext('2d')!; ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob((b) => b && download(`figure${fig.id}.png`, b, 'image/png'), 'image/png');
  };
  const copyTex = async () => { if (!fig) return; try { await navigator.clipboard.writeText(fig.tex); toast.success('LaTeX copied: paste it into your document (it needs \\usepackage{pgfplots}).'); } catch { download(`figure${fig.id}.tex`, fig.tex, 'text/x-tex'); } };

  const script = list[open] ?? list[0];
  const editScript = (code: string) => { if (code === script.code) return; setCodeError(null); save(list.map((s, i) => (i === open ? { ...s, code } : s))); };
  const controls = controlsOf(script.code);
  /** A control moved: its value is written into the script, which runs again (the newest position wins). */
  const live = (c: Control, v: number | boolean | string) => {
    const code = setControl(script.code, c, v);
    editScript(code);
    if (busyNow.current) queued.current = code; else run(code, 'live');
  };

  const panel = 'panel flex min-h-0 flex-col overflow-hidden p-0';
  const head = 'flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 text-[13px] font-semibold text-zinc-800 dark:border-white/10 dark:text-zinc-100';
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';

  const command = (
    <section className={cn(panel, 'h-full')} aria-label="Command window">
      <div className={cn(head, 'relative')}>Command window
        <span className="ms-auto inline-flex items-center gap-2 text-xs font-normal text-zinc-500">
          {busy && <>running…<button type="button" onClick={stop} className={btn}><Square className="h-3.5 w-3.5" aria-hidden />Stop</button></>}
          <button type="button" onClick={() => setBrowsing(true)} className={btn}><BookOpen className="h-3.5 w-3.5" aria-hidden />Functions</button>
        </span>
        {busy && <span className="lab-busy" aria-hidden><span className="bg-indigo-600" /></span>}
      </div>
      <div ref={logBox} role="log" aria-label="Output" tabIndex={0} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[13px] leading-relaxed" data-no-motion>
        {log.map((l, i) => <pre key={i} className={cn('whitespace-pre-wrap break-words', l.k === 'in' ? 'text-zinc-500 dark:text-zinc-400' : l.k === 'err' ? 'text-red-700 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100')}>{l.k === 'in' && !l.t.startsWith('>>') ? `>> ${l.t}` : l.t}</pre>)}
      </div>
      <div className="flex items-start gap-2 border-t border-zinc-200/80 px-3 py-2 font-mono text-[13px] dark:border-white/10">
        <span aria-hidden className="pt-1 text-zinc-500">&gt;&gt;</span>
        <textarea value={cmd} rows={Math.min(6, cmd.split('\n').length)} onChange={(e) => setCmd(e.target.value)} aria-label="Command" spellCheck={false} placeholder="Type a command, then Enter"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); complete(e.currentTarget); }
            else if (e.key === 'ArrowUp' && !cmd.includes('\n') && hist.length) { e.preventDefault(); const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(n); setCmd(hist[n]); }
            else if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); const n = hi + 1; if (n >= hist.length) { setHi(-1); setCmd(''); } else { setHi(n); setCmd(hist[n]); } }
          }}
          className="min-w-0 flex-1 resize-none border-0 bg-transparent p-1 text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:shadow-none! dark:text-zinc-100" />
      </div>
    </section>
  );

  const editor = (
    <section className={cn(panel, 'h-full')} aria-label="Script editor">
      <div className={cn(head, 'flex-wrap')}>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Scripts">
          {list.map((s, i) => (
            <button key={`${s.name}-${i}`} type="button" role="tab" aria-selected={i === open} onClick={() => setOpen(i)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px]', i === open ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-white/[0.1] dark:text-white' : 'font-normal text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.05]')}>
              <FileCode2 className="h-3.5 w-3.5" aria-hidden />{s.name}
            </button>
          ))}
        </div>
        <button type="button" className={btn} onClick={() => { const name = `untitled${list.length + 1}.m`; save([...list, { name, code: '' }]); setOpen(list.length); }}><FilePlus2 className="h-3.5 w-3.5" aria-hidden />New</button>
        <button type="button" className={btn} disabled={list.length <= 1} onClick={() => { if (!confirm(`Delete ${script.name}?`)) return; save(list.filter((_, i) => i !== open)); setOpen(Math.max(0, open - 1)); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>
        <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => run(script.code, 'script')}><Play className="h-3.5 w-3.5" aria-hidden />Run</button>
      </div>
      <label className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-1.5 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400">Name
        <input value={script.name} onChange={(e) => save(list.map((s, i) => (i === open ? { ...s, name: e.target.value.replace(/[^\w.-]/g, '') || 'script.m' } : s)))} className="min-w-0 flex-1 bg-transparent font-mono text-zinc-800 outline-none dark:text-zinc-100" />
      </label>
      {controls.length > 0 && (
        <div role="group" aria-label="Live controls" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10" data-no-motion>
          {controls.map((c) => <LiveControl key={`${c.name}-${c.kind}`} c={c} onChange={(v) => live(c, v)} />)}
        </div>
      )}
      <LabEditor key={open} value={script.code} onChange={editScript} onRun={() => run(script.code, 'script')} dark={dark} label={`Code of ${script.name}`}
        vars={vars.map((v) => v.name)} describe={describe} error={codeError} namesVersion={namesVersion} />
    </section>
  );

  const variables = (
    <section className={cn(panel, 'h-full')} aria-label="Variables">
      <div className={head}>Variables{vars.length > 0 && <span className="font-normal text-zinc-500">{vars.length}</span>}</div>
      {vars.length ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white text-start text-xs text-zinc-500 dark:bg-[#1b1d22] dark:text-zinc-400"><tr><th className="px-3 py-1.5 text-start font-medium">Name</th><th className="px-2 py-1.5 text-start font-medium">Value</th><th className="px-2 py-1.5 text-start font-medium">Size</th></tr></thead>
            <tbody>
              {vars.map((v) => (
                <tr key={v.name} className="border-t border-zinc-100 dark:border-white/[0.06]">
                  <td className="px-3 py-1.5"><button type="button" className="font-mono font-semibold text-zinc-900 hover:underline dark:text-white" onClick={() => inspect({ name: v.name, steps: [], page: 0, from: [0, 0] })} title={`${v.cls}: open ${v.name}`}>{v.name}</button></td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-200" title={v.value}>{v.value}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-500 dark:text-zinc-400">{v.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">Variables you make appear here.</p>}
    </section>
  );

  const fileList = (
    <section className={cn(panel, 'h-full')} aria-label="Files">
      <div className={head}>Files{files.length > 0 && <span className="font-normal text-zinc-500">{files.length}</span>}
        <button type="button" className={cn(btn, 'ms-auto')} onClick={() => picker.current?.click()}><Upload className="h-3.5 w-3.5" aria-hidden />Upload</button>
        <input ref={picker} type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length ? (
        <ul className="min-h-0 flex-1 overflow-auto" data-no-motion>
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 border-t border-zinc-100 px-3 py-1.5 text-[13px] first:border-t-0 dark:border-white/[0.06]">
              <FileIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              <button type="button" className="min-w-0 flex-1 truncate text-start font-mono text-zinc-900 hover:underline dark:text-white" title={`Put '${f.name}' in the command`} onClick={() => { setCmd((c) => `${c}'${f.name}'`); setTab('command'); }} translate="no">{f.name}</button>
              <span className="shrink-0 tabular-nums text-xs text-zinc-500 dark:text-zinc-400">{sizeText(f.size)}</span>
              <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/[0.08] dark:hover:text-white" aria-label={`Download ${f.name}`} onClick={() => { const d = fileData.current.get(f.name); if (d) download(f.name, d.bytes as BlobPart, 'application/octet-stream'); }}><Download className="h-3.5 w-3.5" aria-hidden /></button>
              <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-700 dark:hover:bg-white/[0.08] dark:hover:text-red-400" aria-label={`Delete ${f.name}`} onClick={() => removeFile(f.name)}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">Upload or drop spreadsheets (CSV, Excel), .mat files, pictures or text here, then use them by name: <code className="font-mono">readmatrix(&apos;data.csv&apos;)</code>. They stay on this device.</p>}
    </section>
  );

  const figure = (
    <section className={cn(panel, 'h-full')} aria-label="Figure">
      <div className={cn(head, 'flex-wrap')}>
        <span>Figure</span>
        {figs.length > 1 && figs.map((f) => <button key={f.id} type="button" aria-pressed={f.id === fig?.id} onClick={() => setCurrent(f.id)} className={cn('rounded-md px-2 py-0.5 text-xs', f.id === fig?.id ? 'bg-zinc-100 font-semibold dark:bg-white/[0.1]' : 'font-normal text-zinc-500')}>{f.id}</button>)}
        <span className="ms-auto flex flex-wrap gap-1">
          <button type="button" className={btn} disabled={!fig} onClick={() => void png()}><ImageIcon className="h-3.5 w-3.5" aria-hidden />PNG</button>
          <button type="button" className={btn} disabled={!fig} onClick={() => fig && download(`figure${fig.id}.svg`, fig.light, 'image/svg+xml')}><Download className="h-3.5 w-3.5" aria-hidden />SVG</button>
          <button type="button" className={btn} disabled={!fig} onClick={() => void copyTex()}><Copy className="h-3.5 w-3.5" aria-hidden />LaTeX</button>
        </span>
      </div>
      {fig ? (
        // Our own SVG (src/lib/lab/plot.ts), its text escaped there.
        <div key={fig.id} ref={figBox} className="swap min-h-0 flex-1 p-2 [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-full" data-dir="next" role="img" aria-label={`Figure ${fig.id}`} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">Figures appear here. Try plot(1:10) in the command window.</p>}
    </section>
  );

  const viewer = shown && (
    <VariableViewer shown={shown} busy={busy} onAsk={inspect} onClose={() => inspect(null)} onRun={(code) => run(code, 'cmd')}
      onInsert={(expr) => { setCmd((c) => c + expr); setTab('command'); inspect(null); }} />
  );

  return (
    <div className={cn('relative flex h-[calc(100dvh-10.5rem+var(--bare-gain,0px))] min-h-[30rem] flex-col gap-3', dragging && 'rounded-2xl outline-2 outline-offset-4 outline-blue-600 outline-dashed')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}>
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_minmax(22rem,30rem)] gap-3">
          <div className="grid min-h-0 grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">{variables}{fileList}</div>
          <div className="grid min-h-0 grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">{editor}{command}</div>
          {figure}
        </div>
      ) : (
        <>
          <Segmented<Tab> label="Hyperion part" value={tab} onChange={setTab} segments={[{ value: 'command', label: 'Command' }, { value: 'editor', label: 'Editor' }, { value: 'variables', label: 'Variables' }, { value: 'files', label: 'Files' }, { value: 'figure', label: 'Figure' }]} />
          <div key={tab} className="swap min-h-0 flex-1" data-dir={tabDir}>{tab === 'command' ? command : tab === 'editor' ? editor : tab === 'variables' ? variables : tab === 'files' ? fileList : figure}</div>
        </>
      )}
      {viewer}
      {browsing && <FunctionBrowser onClose={() => setBrowsing(false)} onPick={(syntax) => { setBrowsing(false); setCmd(syntax); setTab('command'); }} />}
    </div>
  );
}

/** One live control: a slider with its value, a switch, or a menu. */
function LiveControl({ c, onChange }: { c: Control; onChange: (v: number | boolean | string) => void }) {
  const label = 'font-mono text-[13px] font-semibold text-zinc-800 dark:text-zinc-100';
  if (c.kind === 'toggle') {
    const on = c.value === true;
    return (
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex items-center gap-2">
        <span className={label}>{c.name}</span>
        <span className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-600')}>
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out', on ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0.5 rtl:-translate-x-0.5')} />
        </span>
      </button>
    );
  }
  if (c.kind === 'menu') {
    return (
      <label className="inline-flex items-center gap-2">
        <span className={label}>{c.name}</span>
        <select value={String(c.value)} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] dark:border-white/15 dark:bg-white/[0.06]">
          {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="inline-flex min-w-[14rem] flex-1 items-center gap-2 sm:max-w-[22rem]">
      <span className={label}>{c.name}</span>
      <input type="range" min={c.min} max={c.max} step={c.step} value={Number(c.value)} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-indigo-600" />
      <span className="w-12 text-end font-mono text-[13px] tabular-nums text-zinc-600 dark:text-zinc-300">{+Number(c.value).toPrecision(4)}</span>
    </label>
  );
}
