'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { BookOpen, ChevronLeft, ChevronRight, Copy, Download, Eye, Film, Gauge, Lightbulb, Share2, File as FileIcon, Pause, SkipBack, SkipForward, X, FilePlus2, FileCode2, Image as ImageIcon, Play, Square, Trash2, Upload } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import type { FigOut, FileIn, FromLab, Inspect, ToLab, VarRow } from './lab.worker';
import { LabText } from './LabText';
import { LabNotebook, type NoteOut } from './LabNotebook';
import { notebookOf } from '@/lib/lab/notebook';
import { readShare, shareFragment, type Shared } from '@/lib/lab/share';
import { compared, hotLines, timeText, type Profile } from '@/lib/lab/profile';
import { lintScript } from '@/lib/lab/lint';
import { QrCode } from '@/components/ui/QrCode';
import { VariableViewer, type Shown } from './VariableViewer';
import { FunctionBrowser } from './FunctionBrowser';
import { HELP } from '@/lib/lab/help';
import { printedUpTo, varsAt, type TraceStep } from '@/lib/lab/trace';
import { forget, keep, keptFiles, MAX_FILE, pixelsOf, sizeText } from './lab-files';
import { controlsOf, setControl, type Control } from '@/lib/lab/controls';
import { LabEditor } from './LabEditor';
import { FRAME_H, FRAME_W, LabSweep, type Sweep } from './LabSweep';
import { MAX_FRAMES, sweepCodes, sweepValues } from '@/lib/lab/sweep';
import { builtinNames } from './matlab-lang';

// M376: Hyperion's window: the command window, a script editor, the variables and the figures, like a desktop
// maths program. The engine (src/lib/lab) runs in a background worker (lab.worker.ts): the page never freezes and
// Stop ends a run. Scripts are kept on this device, and so are files (M383: uploaded, or written by code; IndexedDB).
// Phones get the same parts as tabs.

type Line = { k: 'in' | 'out' | 'err'; t: string };
type Tab = 'command' | 'editor' | 'variables' | 'files' | 'figure';
const TABS: Tab[] = ['command', 'editor', 'variables', 'files', 'figure'];
type From = 'cmd' | 'script' | 'live' | 'watch' | 'note' | 'profile' | 'sweep';
/** Watch it run (M393): a recorded run being played back. */
interface Watch { steps: TraceStep[]; full: boolean; k: number; playing: boolean; speed: number; script: number }
const SPEEDS = [1, 2, 4, 8, 16, 32];
interface Script { name: string; code: string }
const KEEP = 'uv-lab-scripts';
const EXAMPLES: Script[] = [
  { name: 'first_plot.m', code: "% A first plot: press Run (or Ctrl+Enter)\nx = linspace(0, 2*pi, 200);\nplot(x, sin(x), x, cos(x), '--')\ntitle('sin and cos')\nxlabel('x'); grid on\nlegend('sin', 'cos')\n" },
  { name: 'matrices.m', code: "% Solve A x = b\nA = [4 -2 1; -2 4 -2; 1 -2 4];\nb = [11; -16; 17];\nx = A \\ b\ncheck = A * x - b\nd = det(A)\n" },
  { name: 'spring.m', code: "% A damped spring with ode45\nf = @(t, y) [y(2); -4*y(1) - 0.5*y(2)];\n[t, y] = ode45(f, [0 20], [1; 0]);\nplot(t, y(:, 1)); grid on\ntitle('Position over time'); xlabel('t (s)'); ylabel('x (m)')\n" },
  { name: 'fit.m', code: "% Fit a line to measurements\nx = 0:10;\ny = 2.5*x + 1 + randn(1, 11);\np = polyfit(x, y, 1)\nscatter(x, y); hold on\nplot(x, polyval(p, x), 'r'); hold off\nlegend('data', 'fit'); title(sprintf('y = %.2f x + %.2f', p(1), p(2)))\n" },
  { name: 'waves.m', code: "% Live controls: drag them and the figure follows\nfreq = 2;        % slider 0.5 8\ndamping = 0.3;   % slider 0 1\nshape = 'sine';  % menu sine square sawtooth\nshowEnvelope = true; % toggle\nt = linspace(0, 10, 600);\nswitch shape\n  case 'sine', y = sin(2*pi*freq*t/5);\n  case 'square', y = sign(sin(2*pi*freq*t/5));\n  otherwise, y = 2*mod(freq*t/5, 1) - 1;\nend\ny = y .* exp(-damping*t);\nplot(t, y); hold on\nif showEnvelope, plot(t, exp(-damping*t), '--', t, -exp(-damping*t), '--'); end\nhold off; ylim([-1.2 1.2]); grid on\ntitle(sprintf('%s wave, f = %.1f', shape, freq))\n" },
  { name: 'notebook.m', code: "%% Projectile motion\n% Press **Notebook** above to read this script as a page. A ball thrown at speed $v_0$\n% and angle $\\theta$ lands after $$t = \\frac{2 v_0 \\sin\\theta}{g}$$ and travels $x = v_0 \\cos\\theta \\, t$.\nv0 = 20;      % slider 5 40\ntheta = 45;   % slider 10 80\ng = 9.81;\nt = 2*v0*sind(theta)/g\nx = v0*cosd(theta)*t\n\n%% The path\n% Height against distance; move the sliders and every part runs again.\ntt = linspace(0, t, 100);\nplot(v0*cosd(theta)*tt, v0*sind(theta)*tt - g*tt.^2/2); grid on\nxlabel('distance (m)'); ylabel('height (m)')\n\n%% The exact answer\n% With symbols the distance is a formula; the longest throw is at $45^\\circ$.\nsyms v a\ndistance = simplify(v^2*sin(2*a)/g)\n" },
  { name: 'symbolic.m', code: "% Exact maths with symbols: answers are set as real maths\nsyms x\nf = x^3 - 6*x^2 + 11*x - 6\ndf = diff(f)\nr = solve(f == 0, x)\narea = int(f, 0, 1)\none = simplify(sin(x)^2 + cos(x)^2)\nseries = taylor(exp(x), x, 'Order', 5)\na = 1;   % slider -3 3\nfplot(f + a*x, [0 4]); grid on\ntitle('f(x) + a x')\n" },
  { name: 'surface.m', code: "% A surface you can turn, and its contours\n[X, Y, Z] = peaks(40);\nsubplot(1, 2, 1)\nsurf(X, Y, Z); shading interp; colorbar\ntitle('peaks'); xlabel('x'); ylabel('y')\nview(-30, 35)\nsubplot(1, 2, 2)\ncontourf(X, Y, Z, 12)\ntitle('from above')\n" },
];
const read = (): Script[] => { try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); return Array.isArray(v) && v.length ? v : EXAMPLES; } catch { return EXAMPLES; } };
const lineOf = (code: string, at: number) => code.slice(0, at).split('\n').length;
/** A control moved in the notebook view while something ran: run every section of this script, afterwards. */
const NOTE_ALL = '\u0000notes\u0000';
/** The longest link a QR code holds (version 40, level M, bytes). */
const QR_MAX = 2300;
const noteKey = (script: number, code: string) => `${script}\u0000${code}`;

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
  const [watch, setWatch] = useState<Watch | null>(null);
  const [traceSvg, setTraceSvg] = useState<Record<number, { light: string; dark: string }>>({});
  const [breakpoints, setBreakpoints] = useState<Record<number, number[]>>({});
  const looking = useRef<Inspect | null>(null);
  const [codeError, setCodeError] = useState<{ line: number; message: string } | null>(null);
  // Notebook pages (M397): the view, each section's last results (by its code, so an edited section starts afresh),
  // and the sections waiting to run one after another.
  const [noteView, setNoteView] = useState<Record<number, boolean>>({});
  const [noteOuts, setNoteOuts] = useState<Record<string, NoteOut>>({});
  const [noteState, setNoteState] = useState<{ running: number | null; waiting: number[] }>({ running: null, waiting: [] });
  const noteQueue = useRef<{ index: number; key: string; code: string; label: string }[]>([]);
  const noteNow = useRef<{ index: number; key: string } | null>(null);
  const noteBuf = useRef('');
  // Shared links (M398): a script that came in a link (#s=…), and this script's own link while Share is open.
  const [incoming, setIncoming] = useState<Shared | null>(null);
  const [sharing, setSharing] = useState(false);
  const [link, setLink] = useState<{ url: string; error?: string } | null>(null);
  const [bigQr, setBigQr] = useState(false);
  // Time it (M400): each script's last two timed runs (the newest shown while its code is unchanged, compared with the
  // one before it, M401) and a line to jump to.
  const [profs, setProfs] = useState<Record<number, (Profile & { code: string })[]>>({});
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null);
  // Sweep (M402): a slider run through its range (the film and its table), and the form that starts one.
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [sweepAsk, setSweepAsk] = useState<{ name: string; from: string; to: string; n: number } | null>(null);
  const sweepUrls = useRef<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileData = useRef(new Map<string, FileIn>());
  const picker = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; code: string; from: From } | null>(null);
  const busyNow = useRef(false), queued = useRef<string | null>(null), lastLiveError = useRef(''), watchingScript = useRef(0);
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
    if (from === 'note') noteBuf.current = '';
    else if (from !== 'live') print({ k: 'in', t: from === 'cmd' ? code : `>> ${from === 'watch' ? 'watch' : from === 'profile' ? 'time' : 'run'} ${list[open]?.name ?? 'script'}` });
    if (from === 'watch') { watchingScript.current = open; worker.current.postMessage({ watch: code, id } satisfies ToLab); }
    else if (from === 'profile') { watchingScript.current = open; worker.current.postMessage({ profile: code, id } satisfies ToLab); }
    else worker.current.postMessage({ run: code, id } satisfies ToLab);
  };
  /** The next waiting notebook section, if any. */
  const nextNote = () => {
    const n = noteQueue.current.shift();
    if (!n) { if (noteNow.current) { noteNow.current = null; setNoteState({ running: null, waiting: [] }); } return; }
    noteNow.current = { index: n.index, key: n.key };
    setNoteState({ running: n.index, waiting: noteQueue.current.map((q) => q.index) });
    run(n.code, 'note');
  };
  /** Run a script's sections (all, or one) one after another, in the same workspace. */
  const runNotes = (code: string, scriptIndex: number, only?: number) => {
    const secs = notebookOf(code);
    noteQueue.current = (only === undefined ? secs.map((_, i) => i) : [only]).map((i) => ({ index: i, key: noteKey(scriptIndex, secs[i].code), code: secs[i].code, label: secs[i].title }));
    setNoteState({ running: noteNow.current?.index ?? null, waiting: noteQueue.current.map((q) => q.index) });
    if (!busyNow.current) nextNote();
  };
  const start = () => {
    const w = new Worker(new URL('./lab.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromLab>) => {
      const m = e.data;
      // A live run (a control moved) keeps the command window quiet: the figure and variables show the change.
      if ('out' in m) { if (pending.current?.from === 'note') noteBuf.current += m.out; else if (pending.current?.from !== 'live') print({ k: 'out', t: m.out }); return; }
      if ('fig' in m) { setFigs((fs) => fs.map((f) => (f.id === m.fig.id ? m.fig : f))); return; }
      if ('names' in m) { for (const n of m.names) builtinNames.add(n); setNamesVersion((v) => v + 1); return; }
      if ('view' in m) { if (looking.current) setShown(m.view); return; }
      if ('traceFig' in m) { setTraceSvg((t) => ({ ...t, [m.traceFig.index]: { light: m.traceFig.light, dark: m.traceFig.dark } })); return; }
      if ('sweepFrame' in m) {
        const { index, frame } = m.sweepFrame, url = (svg: string) => { if (!svg) return ''; const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); sweepUrls.current.push(u); return u; };
        const shown = { ...frame, lightUrl: url(frame.light), darkUrl: url(frame.dark) };
        setSweep((s) => { if (!s) return s; const frames = [...s.frames]; frames[index] = shown; return { ...s, frames }; });
        return;
      }
      if ('profiled' in m) { const p = pending.current, at = watchingScript.current; if (p) setProfs((all) => ({ ...all, [at]: [...(all[at] ?? []).slice(-1), { code: p.code, ...m.profiled }] })); return; }
      if ('trace' in m) {
        // The recorded run: played back from its first step; everything it printed also goes to the log, for afterwards.
        const all = printedUpTo(m.trace.steps, m.trace.steps.length - 1);
        if (all) print({ k: 'out', t: all });
        setTraceSvg({});
        setWatch(m.trace.steps.length ? { steps: m.trace.steps, full: m.trace.full, k: 0, playing: true, speed: 4, script: watchingScript.current } : null);
        return;
      }
      const p = pending.current;
      if (p?.from === 'sweep') setSweep((s) => (s ? { ...s, done: true } : s));
      if (p?.from === 'note') {
        // Taken now: the next section's run clears the buffer before React applies this update.
        const at = noteNow.current, out: NoteOut = { text: noteBuf.current, error: m.error, figs: (m.figs ?? []).filter((f) => m.drawn.includes(f.id)) };
        if (at) setNoteOuts((o) => ({ ...o, [at.key]: out }));
        // Later sections usually need this one: an error stops the rest.
        if (m.error) noteQueue.current = [];
      }
      const errText = m.error && p?.from !== 'note' ? `Error${p?.from !== 'cmd' && m.at !== undefined && p ? ` (line ${lineOf(p.code, m.at)})` : ''}: ${m.error}\n` : '';
      if (m.error && !(p?.from === 'live' && errText === lastLiveError.current)) print({ k: 'err', t: errText });
      lastLiveError.current = errText; // a live run repeating the same error stays quiet
      // A script's error is marked on its line in the editor (until the code changes).
      setCodeError(m.error && p && p.from !== 'cmd' && p.from !== 'note' && m.at !== undefined ? { line: lineOf(p.code, m.at), message: m.error } : null);
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
      if (next !== null) { queued.current = null; if (next.startsWith(NOTE_ALL)) { const [k, ...rest] = next.slice(NOTE_ALL.length).split('\u0000'); runNotes(rest.join('\u0000'), Number(k)); } else run(next, 'live'); }
      else nextNote();
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
  useEffect(() => {
    const readHash = () => { void readShare(window.location.hash).then((s) => { if (s) setIncoming(s); }); };
    readHash();
    const onHash = () => readHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
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
  // M399: a name is a function when the help or the engine knows it (the checker and Explain).
  const isFn = (n: string) => HELP.has(n) || builtinNames.has(n);
  const [explainOn, setExplainOn] = useState(false);
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
    setSweep((s) => (s ? { ...s, done: true } : s));
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
  const editScript = (code: string) => { if (code === script.code) return; setCodeError(null); setWatch(null); save(list.map((s, i) => (i === open ? { ...s, code } : s))); };
  const controls = controlsOf(script.code);
  const noteSecs = noteView[open] ? notebookOf(script.code) : null;
  const runs = profs[open] ?? [], latest = runs[runs.length - 1];
  const timed = latest && latest.code === script.code ? latest : null;
  const before = timed && runs.length > 1 ? runs[runs.length - 2] : null;
  const vs = timed && before ? compared(timed.total, before.total) : null;
  /** The functions that took the most of their own time (M401). */
  const fnRows = (timed?.fns ?? []).filter((f) => f.self > 0).slice(0, 10);
  // Worked out once per timed run (not on every render: the editor redraws its bars when this changes).
  const { hot, heat } = useMemo(() => {
    if (!timed) return { hot: null, heat: null };
    const most = Math.max(1e-9, ...timed.lines.map((l) => l.ms));
    return {
      hot: hotLines(timed.code, timed, lintScript(timed.code, (n) => HELP.has(n) || builtinNames.has(n)).problems),
      heat: new Map(timed.lines.map((l) => [l.line, { level: l.ms / most, label: `${timeText(l.ms)} · ${l.count.toLocaleString()} time${l.count === 1 ? '' : 's'}` }])),
    };
  }, [timed]);
  const runSection = (i: number) => runNotes(script.code, open, i);
  // This script's link, made again while Share is open and the script (or its view) changes.
  const shareView = noteView[open] ? 'note' : 'code';
  useEffect(() => {
    if (!sharing) return;
    let live = true;
    shareFragment({ name: script.name, code: script.code, view: shareView })
      .then((f) => { if (live) setLink({ url: `${window.location.origin}/hyperion#${f}` }); })
      .catch((e: unknown) => { if (live) setLink({ url: '', error: e instanceof Error ? e.message : 'Couldn’t make a link.' }); });
    return () => { live = false; };
  }, [sharing, script.name, script.code, shareView]);
  const copyLink = async () => { if (!link?.url) return; try { await navigator.clipboard.writeText(link.url); toast.success('Link copied: anyone who opens it gets a copy of this script.'); } catch { toast.error('Copying isn’t allowed here: select the link and copy it.'); } };
  const openShared = () => {
    if (!incoming) return;
    const taken = new Set(list.map((x) => x.name)), base = incoming.name.replace(/\.m$/, '');
    let name = incoming.name;
    for (let k = 2; taken.has(name); k++) name = `${base}-${k}.m`;
    const at = list.length;
    save([...list, { name, code: incoming.code }]);
    setOpen(at);
    setNoteView((v) => ({ ...v, [at]: incoming.view === 'note' }));
    setTab('editor');
    setIncoming(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const dismissShared = () => { setIncoming(null); window.history.replaceState(null, '', window.location.pathname + window.location.search); };
  const runAllSections = () => runNotes(script.code, open);
  // ——— Sweep ———
  const sliders = controls.filter((c) => c.kind === 'slider');
  const askSweep = () => setSweepAsk((a) => (a ? null : sliders[0] ? { name: sliders[0].name, from: String(sliders[0].min), to: String(sliders[0].max), n: 12 } : null));
  const dropSweep = () => { for (const u of sweepUrls.current) URL.revokeObjectURL(u); sweepUrls.current = []; setSweep(null); };
  useEffect(() => () => { for (const u of sweepUrls.current) URL.revokeObjectURL(u); }, []);
  const startSweep = () => {
    const c = sliders.find((x) => x.name === sweepAsk?.name);
    if (!c || !sweepAsk || busyNow.current || !worker.current) return;
    const values = sweepValues(c, Number(sweepAsk.from), Number(sweepAsk.to), sweepAsk.n);
    if (values.length < 2) { toast.error('Give two different numbers for where the sweep starts and ends.'); return; }
    dropSweep();
    const id = ++seq.current;
    pending.current = { id, code: script.code, from: 'sweep' };
    busyNow.current = true;
    setBusy(true);
    setSweep({ script: open, scriptName: script.name, name: c.name, values, frames: [], done: false });
    setSweepAsk(null);
    setTab('figure');
    print({ k: 'in', t: `>> sweep ${c.name} from ${values[0]} to ${values[values.length - 1]} (${values.length} runs) in ${script.name}` });
    worker.current.postMessage({ sweep: { codes: sweepCodes(script.code, c, values), values, w: FRAME_W, h: FRAME_H }, id } satisfies ToLab);
  };
  /** "Use this value": the slider goes to a frame's value and the script runs with it. */
  const sweepSlider = sweep && sweep.script === open ? sliders.find((c) => c.name === sweep.name) : undefined;
  const takeSwept = (v: number) => { if (sweepSlider) live(sweepSlider, v); };
  /** A control moved: its value is written into the script, which runs again (the newest position wins). */
  const live = (c: Control, v: number | boolean | string) => {
    const code = setControl(script.code, c, v);
    editScript(code);
    // In the notebook view every section runs again, so each one's results follow the control.
    if (noteView[open]) { if (busyNow.current) queued.current = `${NOTE_ALL}${open}\u0000${code}`; else runNotes(code, open); return; }
    if (busyNow.current) queued.current = code; else run(code, 'live');
  };

  // ——— Watch it run: playback ———
  const step = watch ? watch.steps[watch.k] : null;
  const watching = !!watch && watch.script === open;
  const marks = breakpoints[open] ?? [];
  const toBreak = (from: number) => { if (!watch) return from; for (let i = from + 1; i < watch.steps.length; i++) if ((breakpoints[watch.script] ?? []).includes(watch.steps[i].line)) return i; return watch.steps.length - 1; };
  const seek = (k: number, playing = false) => setWatch((w) => (w ? { ...w, k: Math.max(0, Math.min(w.steps.length - 1, k)), playing } : w));
  const playing = !!watch?.playing, at = watch?.k ?? 0, speed = watch?.speed ?? 4;
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      setWatch((w) => {
        if (!w) return w;
        const next = w.k + 1;
        if (next >= w.steps.length) return { ...w, playing: false };
        // A breakpoint stops the playback on its line.
        const stop = (breakpoints[w.script] ?? []).includes(w.steps[next].line);
        return { ...w, k: next, playing: !stop };
      });
    }, 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, at, speed, breakpoints]);
  const figIndex = step && watching ? step.fig : -1;
  useEffect(() => {
    if (figIndex < 0 || traceSvg[figIndex]) return;
    const el = figBox.current;
    const w = Math.round((el?.clientWidth ?? 640) - 16), h = Math.round(Math.min((el?.clientHeight ?? 480) - 16, w * 0.8));
    worker.current?.postMessage({ traceFig: figIndex, w: Math.max(240, w), h: Math.max(200, h) } satisfies ToLab);
  }, [figIndex, traceSvg]);

  const panel = 'panel flex min-h-0 flex-col overflow-hidden p-0';
  const head = 'flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 text-[13px] font-semibold text-zinc-800 dark:border-white/10 dark:text-zinc-100';
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 hover:bg-white disabled:opacity-35 dark:text-zinc-200 dark:hover:bg-white/[0.1]';

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
        {watching && watch ? <pre className="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100"><span className="text-violet-700 dark:text-violet-300">{`Watching: what the run printed up to step ${watch.k + 1}\n`}</span><LabText text={printedUpTo(watch.steps, watch.k)} /></pre> : <>
        {log.map((l, i) => <pre key={i} className={cn('whitespace-pre-wrap break-words', l.k === 'in' ? 'text-zinc-500 dark:text-zinc-400' : l.k === 'err' ? 'text-red-700 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100')}>{l.k === 'in' ? (l.t.startsWith('>>') ? l.t : `>> ${l.t}`) : <LabText text={l.t} />}</pre>)}
        </>}
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
      <div className={head}>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Scripts">
          {list.map((s, i) => (
            <button key={`${s.name}-${i}`} type="button" role="tab" aria-selected={i === open} onClick={() => setOpen(i)}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px]', i === open ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-white/[0.1] dark:text-white' : 'font-normal text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.05]')}>
              <FileCode2 className="h-3.5 w-3.5" aria-hidden />{s.name}
            </button>
          ))}
        </div>
      </div>
      {watching && watch && step && (
        <div role="group" aria-label="Watch it run" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/80 bg-violet-50/60 px-3 py-2 dark:border-white/10 dark:bg-violet-950/30" data-no-motion>
          <span className="inline-flex items-center gap-0.5">
            <button type="button" className={iconBtn} aria-label="Back to the start" onClick={() => seek(0)}><SkipBack className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            <button type="button" className={iconBtn} aria-label="One step back" disabled={watch.k === 0} onClick={() => seek(watch.k - 1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            <button type="button" className={cn(iconBtn, 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400')} aria-label={watch.playing ? 'Pause' : 'Play'} onClick={() => seek(watch.k >= watch.steps.length - 1 ? 0 : watch.k, !watch.playing)}>{watch.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}</button>
            <button type="button" className={iconBtn} aria-label="One step forward" disabled={watch.k >= watch.steps.length - 1} onClick={() => seek(watch.k + 1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
            <button type="button" className={iconBtn} aria-label={marks.length ? 'Next breakpoint' : 'To the end'} onClick={() => seek(toBreak(watch.k))}><SkipForward className="h-4 w-4 rtl:rotate-180" aria-hidden /></button>
          </span>
          <input type="range" min={0} max={watch.steps.length - 1} value={watch.k} onChange={(e) => seek(Number(e.target.value))} aria-label="Step" className="min-w-[8rem] flex-1 accent-violet-600" />
          <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">step {watch.k + 1} / {watch.steps.length} · line {step.line}{step.depth ? ` · in a function (${step.depth})` : ''}</span>
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">Speed
            <select value={watch.speed} onChange={(e) => setWatch((w) => (w ? { ...w, speed: Number(e.target.value) } : w))} className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs dark:border-white/15 dark:bg-white/[0.06]">
              {SPEEDS.map((v) => <option key={v} value={v}>{v} a second</option>)}
            </select>
          </label>
          <button type="button" className={iconBtn} aria-label="Stop watching" onClick={() => setWatch(null)}><X className="h-4 w-4" aria-hidden /></button>
          {watch.full && <span className="w-full text-xs text-zinc-600 dark:text-zinc-300">The first {watch.steps.length} steps were recorded; the run itself went on to the end.</span>}
          {!marks.length && <span className="w-full text-xs text-zinc-500 dark:text-zinc-400">Click beside a line number to stop there (a breakpoint).</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-zinc-200/80 px-3 py-1.5 dark:border-white/10">
        <label className="flex min-w-[9rem] flex-1 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">Name
          <input value={script.name} onChange={(e) => save(list.map((s, i) => (i === open ? { ...s, name: e.target.value.replace(/[^\w.-]/g, '') || 'script.m' } : s)))} className="min-w-0 flex-1 bg-transparent font-mono text-zinc-800 outline-none dark:text-zinc-100" />
        </label>
        <button type="button" className={btn} aria-expanded={sharing} onClick={() => setSharing((v) => !v)}><Share2 className="h-3.5 w-3.5" aria-hidden />Share</button>
        {!noteView[open] && <button type="button" className={cn(btn, explainOn && 'bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100')} aria-pressed={explainOn} onClick={() => setExplainOn((v) => !v)} title="What each line does, in plain words under it"><Lightbulb className="h-3.5 w-3.5" aria-hidden />Explain</button>}
        <Segmented<'code' | 'note'> label="Show the script as" value={noteView[open] ? 'note' : 'code'} onChange={(v) => setNoteView((nv) => ({ ...nv, [open]: v === 'note' }))} segments={[{ value: 'code', label: 'Code' }, { value: 'note', label: 'Notebook' }]} />
        <button type="button" className={btn} onClick={() => { const name = `untitled${list.length + 1}.m`; save([...list, { name, code: '' }]); setOpen(list.length); }}><FilePlus2 className="h-3.5 w-3.5" aria-hidden />New</button>
        <button type="button" className={btn} disabled={list.length <= 1} onClick={() => { if (!confirm(`Delete ${script.name}?`)) return; save(list.filter((_, i) => i !== open)); setOpen(Math.max(0, open - 1)); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>
        <button type="button" className={btn} disabled={busy} onClick={() => run(script.code, 'watch')} title="Run it step by step, then play it back"><Eye className="h-3.5 w-3.5" aria-hidden />Watch</button>
        {!noteView[open] && <button type="button" className={btn} disabled={busy} onClick={() => run(script.code, 'profile')} title="Run it and time every line"><Gauge className="h-3.5 w-3.5" aria-hidden />Time it</button>}
        <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => run(script.code, 'script')}><Play className="h-3.5 w-3.5" aria-hidden />Run</button>
      </div>
      {sharing && (
        <div role="group" aria-label="Share this script" className="flex flex-wrap items-start gap-3 border-b border-zinc-200/80 px-3 py-3 dark:border-white/10" data-no-motion>
          <div className="min-w-[14rem] flex-1 space-y-2">
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">Anyone with this link gets their own copy of <b translate="no">{script.name}</b> as it is now{controls.length ? ', sliders where they are' : ''}{shareView === 'note' ? ', opened as a page' : ''}. The script travels inside the link: nothing is stored on our server.</p>
            {link?.error ? <p className="text-xs text-red-700 dark:text-red-400">{link.error}</p> : (
              <div className="flex gap-2">
                <input readOnly value={link?.url ?? ''} aria-label={`Link to ${script.name}`} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs" />
                <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" disabled={!link?.url} onClick={() => void copyLink()}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</button>
              </div>
            )}
            {link?.url && <p className="text-xs text-zinc-600 dark:text-zinc-300">{link.url.length.toLocaleString()} characters{link.url.length > 8000 ? ': some chat apps cut links this long, so send the script as a file instead.' : '.'}</p>}
          </div>
          {link?.url && (link.url.length <= QR_MAX
            ? <span className="flex shrink-0 flex-col items-center gap-1">
                <QrCode value={link.url} size={132} title={`QR code for the link to ${script.name}`} className="rounded-lg bg-white p-1" />
                <button type="button" className={btn} onClick={() => setBigQr(true)}>Show it big</button>
              </span>
            : <p className="w-[132px] shrink-0 text-xs text-zinc-600 dark:text-zinc-300">Too long for a QR code; share the link.</p>)}
        </div>
      )}
      {timed && hot && (
        <div role="group" aria-label="Time per line" className="space-y-1.5 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10" data-no-motion>
          <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200">
            <Gauge className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden />
            <span className="flex-1">Ran in <b className="font-mono tabular-nums">{timeText(timed.total)}</b>
              {vs?.text && <>, <b className={vs.better ? 'text-emerald-700 dark:text-emerald-400' : vs.better === false ? 'text-amber-700 dark:text-amber-400' : ''}>{vs.text}</b> than the time before ({timeText(before!.total)})</>}
              {hot.length ? '. The slowest lines (darker bars beside the code):' : ': no line stands out.'}</span>
            <button type="button" className={iconBtn} aria-label="Hide the times" onClick={() => setProfs((all) => ({ ...all, [open]: [] }))}><X className="h-4 w-4" aria-hidden /></button>
          </div>
          {hot.length > 0 && (
            <ul className="space-y-1">
              {hot.map((h) => (
                <li key={h.line}>
                  <button type="button" onClick={() => setJump((j) => ({ line: h.line, n: (j?.n ?? 0) + 1 }))} className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-start text-xs hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                    <span className="shrink-0 font-mono tabular-nums text-zinc-900 dark:text-white">Line {h.line} · {Math.round(h.share * 100)}%</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{h.tip}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fnRows.length > 0 && (
            <details className="text-xs text-zinc-700 dark:text-zinc-200">
              <summary className="cursor-pointer select-none rounded px-2 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-white/[0.06]">Time inside functions</summary>
              <div className="mt-1 max-h-48 overflow-auto" tabIndex={0} role="region" aria-label="Time inside functions">
                <table className="w-full text-start tabular-nums">
                  <thead className="text-zinc-500 dark:text-zinc-400"><tr>
                    <th className="px-2 py-1 text-start font-medium">Function</th><th className="px-2 py-1 text-end font-medium">Calls</th>
                    <th className="px-2 py-1 text-end font-medium">Own time</th><th className="px-2 py-1 text-end font-medium">With what it calls</th>
                    {before && <th className="px-2 py-1 text-end font-medium">Own time before</th>}
                  </tr></thead>
                  <tbody>
                    {fnRows.map((f) => (
                      <tr key={f.name} className="border-t border-zinc-200/70 dark:border-white/[0.06]">
                        <td className="px-2 py-1 font-mono" translate="no">{f.name}</td>
                        <td className="px-2 py-1 text-end font-mono">{f.calls.toLocaleString()}</td>
                        <td className="px-2 py-1 text-end font-mono">{timeText(f.self)}</td>
                        <td className="px-2 py-1 text-end font-mono">{timeText(f.total)}</td>
                        {before && <td className="px-2 py-1 text-end font-mono">{(() => { const b = before.fns?.find((x) => x.name === f.name); return b ? timeText(b.self) : '–'; })()}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
      {controls.length > 0 && (
        <div role="group" aria-label="Live controls" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/10" data-no-motion>
          {controls.map((c) => <LiveControl key={`${c.name}-${c.kind}`} c={c} onChange={(v) => live(c, v)} />)}
          {sliders.length > 0 && <button type="button" className={cn(btn, sweepAsk && 'bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100')} aria-expanded={!!sweepAsk} onClick={askSweep} title="Run the script for every step of a slider: a film of the figures and a table of the results"><Film className="h-3.5 w-3.5" aria-hidden />Sweep</button>}
        </div>
      )}
      {sweepAsk && sliders.length > 0 && (() => {
        const c = sliders.find((x) => x.name === sweepAsk.name) ?? sliders[0];
        const field = 'w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-[13px] tabular-nums dark:border-white/15 dark:bg-white/[0.06]';
        return (
          <form role="group" aria-label="Sweep a slider" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/80 bg-violet-50/60 px-3 py-2 text-xs text-zinc-700 dark:border-white/10 dark:bg-violet-950/30 dark:text-zinc-200" data-no-motion
            onSubmit={(e) => { e.preventDefault(); startSweep(); }}>
            <label className="inline-flex items-center gap-1.5">Sweep
              {sliders.length > 1 ? (
                <select value={c.name} onChange={(e) => { const n = sliders.find((x) => x.name === e.target.value)!; setSweepAsk({ ...sweepAsk, name: n.name, from: String(n.min), to: String(n.max) }); }} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-[13px] dark:border-white/15 dark:bg-white/[0.06]">
                  {sliders.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
              ) : <b className="font-mono text-[13px]" translate="no">{c.name}</b>}
            </label>
            <label className="inline-flex items-center gap-1.5">from<input type="number" inputMode="decimal" step="any" value={sweepAsk.from} onChange={(e) => setSweepAsk({ ...sweepAsk, from: e.target.value })} className={field} /></label>
            <label className="inline-flex items-center gap-1.5">to<input type="number" inputMode="decimal" step="any" value={sweepAsk.to} onChange={(e) => setSweepAsk({ ...sweepAsk, to: e.target.value })} className={field} /></label>
            <label className="inline-flex items-center gap-1.5">in
              <select value={sweepAsk.n} onChange={(e) => setSweepAsk({ ...sweepAsk, n: Number(e.target.value) })} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] dark:border-white/15 dark:bg-white/[0.06]">
                {[6, 12, 24, MAX_FRAMES].map((n) => <option key={n} value={n}>{n} runs</option>)}
              </select>
            </label>
            <button type="submit" className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={busy}><Play className="h-3.5 w-3.5" aria-hidden />Start</button>
            <button type="button" className={btn} onClick={() => setSweepAsk(null)}>Cancel</button>
            <span className="w-full text-zinc-600 dark:text-zinc-300">Each run starts afresh with {c.name} set to the next value; its figure becomes a frame and the numbers it leaves go in a table.</span>
          </form>
        );
      })()}
      {noteSecs ? <LabNotebook name={script.name} sections={noteSecs} outs={noteSecs.map((sec) => noteOuts[noteKey(open, sec.code)])} running={noteState.running} waiting={noteState.waiting} busy={busy} dark={dark}
          onRun={runSection} onRunAll={runAllSections} onDownload={download} /> : <LabEditor key={open} value={script.code} onChange={editScript} onRun={() => run(script.code, 'script')} dark={dark} label={`Code of ${script.name}`}
        vars={vars.map((v) => v.name)} describe={describe} error={codeError} namesVersion={namesVersion} isFn={isFn} explain={explainOn} heat={heat} jump={jump}
        traceAt={watching && step ? step.line : null} breakpoints={marks}
        onToggleBreak={(line) => setBreakpoints((b) => { const now = b[open] ?? []; return { ...b, [open]: now.includes(line) ? now.filter((l) => l !== line) : [...now, line] }; })} />}
    </section>
  );

  // While watching: the variables the step sees (its function's, inside one), those it changed marked.
  const traceVars = watching && watch ? varsAt(watch.steps, watch.k) : null;
  const traceChanged = new Set(watching && step ? step.changed : []);
  const variables = (
    <section className={cn(panel, 'h-full')} aria-label="Variables">
      <div className={head}>Variables{(traceVars ?? vars).length > 0 && <span className="font-normal text-zinc-500">{(traceVars ?? vars).length}</span>}{traceVars && <span className="ms-auto text-xs font-normal text-violet-700 dark:text-violet-300">at step {watch!.k + 1}</span>}</div>
      {traceVars ? (
        <div className="min-h-0 flex-1 overflow-auto" data-no-motion>
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white text-start text-xs text-zinc-500 dark:bg-[#1b1d22] dark:text-zinc-400"><tr><th className="px-3 py-1.5 text-start font-medium">Name</th><th className="px-2 py-1.5 text-start font-medium">Value</th></tr></thead>
            <tbody>
              {traceVars.map(([name, value]) => (
                <tr key={name} className={cn('border-t border-zinc-100 dark:border-white/[0.06]', traceChanged.has(name) && 'bg-violet-100/70 dark:bg-violet-900/40')}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-zinc-900 dark:text-white">{name}{traceChanged.has(name) && <span className="sr-only"> (changed in this step)</span>}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-200" title={value}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : vars.length ? (
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
        {!(sweep && !watching) && figs.length > 1 && figs.map((f) => <button key={f.id} type="button" aria-pressed={f.id === fig?.id} onClick={() => setCurrent(f.id)} className={cn('rounded-md px-2 py-0.5 text-xs', f.id === fig?.id ? 'bg-zinc-100 font-semibold dark:bg-white/[0.1]' : 'font-normal text-zinc-500')}>{f.id}</button>)}
        {sweep && !watching ? <span className="ms-auto text-xs font-normal text-zinc-500 dark:text-zinc-400" translate="no">Sweep of {sweep.name} in {sweep.scriptName}</span> : <span className="ms-auto flex flex-wrap gap-1">
          <button type="button" className={btn} disabled={!fig} onClick={() => void png()}><ImageIcon className="h-3.5 w-3.5" aria-hidden />PNG</button>
          <button type="button" className={btn} disabled={!fig} onClick={() => fig && download(`figure${fig.id}.svg`, fig.light, 'image/svg+xml')}><Download className="h-3.5 w-3.5" aria-hidden />SVG</button>
          <button type="button" className={btn} disabled={!fig} onClick={() => void copyTex()}><Copy className="h-3.5 w-3.5" aria-hidden />LaTeX</button>
        </span>}
      </div>
      {watching && figIndex >= 0 ? (
        traceSvg[figIndex] ? <div ref={figBox} className="min-h-0 flex-1 p-2 [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-full" role="img" aria-label={`The figure at step ${watch!.k + 1}`} dangerouslySetInnerHTML={{ __html: dark ? traceSvg[figIndex].dark : traceSvg[figIndex].light }} /> : <div ref={figBox} className="min-h-0 flex-1" />
      ) : watching ? <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">No figure yet at this step.</p> : sweep ? (
        <LabSweep sweep={sweep} dark={dark} onClose={dropSweep} onUse={sweepSlider ? takeSwept : null} onDownload={download} />
      ) : fig ? (
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
      {incoming && (
        <div role="status" className="panel flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <Share2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
          <p className="min-w-[12rem] flex-1 text-sm text-zinc-800 dark:text-zinc-100">Someone shared <b translate="no">{incoming.name}</b> with you ({incoming.code.split('\n').length} lines). Open it to read it and run your own copy.</p>
          <button type="button" className="btn-primary btn-sm" onClick={openShared}>Open it</button>
          <button type="button" className={btn} onClick={dismissShared}>Not now</button>
        </div>
      )}
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
      {bigQr && link?.url && (
        // Big enough to scan from the back of a room (a projector, a shared screen).
        <div role="dialog" aria-modal="true" aria-label={`QR code for ${script.name}`} className="fixed inset-0 z-50 grid place-items-center bg-white p-6" onClick={() => setBigQr(false)} onKeyDown={(e) => { if (e.key === 'Escape') setBigQr(false); }}>
          <div className="flex flex-col items-center gap-4">
            <QrCode value={link.url} size={720} title={`QR code for the link to ${script.name}`} className="h-auto w-[min(86vw,78vh)]" />
            <p className="text-center text-base font-semibold text-zinc-900" translate="no">{script.name}</p>
            <button type="button" autoFocus className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => setBigQr(false)}>Close</button>
          </div>
        </div>
      )}
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
