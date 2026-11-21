'use client';

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Copy, Download, FilePlus2, FileCode2, Image as ImageIcon, Play, Square, Trash2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { useMedia } from '@/lib/use-media';
import { cn } from '@/lib/utils';
import type { FigOut, FromLab, ToLab, VarRow } from './lab.worker';

// M376: UniVerse Lab's window: the command window, a script editor, the variables and the figures, like a desktop
// maths program. The engine (src/lib/lab) runs in a background worker (lab.worker.ts): the page never freezes and
// Stop ends a run. Scripts are kept on this device. Phones get the same parts as tabs.

type Line = { k: 'in' | 'out' | 'err'; t: string };
type Tab = 'command' | 'editor' | 'variables' | 'figure';
interface Script { name: string; code: string }
const KEEP = 'uv-lab-scripts';
const EXAMPLES: Script[] = [
  { name: 'first_plot.m', code: "% A first plot: press Run (or Ctrl+Enter)\nx = linspace(0, 2*pi, 200);\nplot(x, sin(x), x, cos(x), '--')\ntitle('sin and cos')\nxlabel('x'); grid on\nlegend('sin', 'cos')\n" },
  { name: 'matrices.m', code: "% Solve A x = b\nA = [4 -2 1; -2 4 -2; 1 -2 4];\nb = [11; -16; 17];\nx = A \\ b\ncheck = A * x - b\nd = det(A)\n" },
  { name: 'spring.m', code: "% A damped spring with ode45\nf = @(t, y) [y(2); -4*y(1) - 0.5*y(2)];\n[t, y] = ode45(f, [0 20], [1; 0]);\nplot(t, y(:, 1)); grid on\ntitle('Position over time'); xlabel('t (s)'); ylabel('x (m)')\n" },
  { name: 'fit.m', code: "% Fit a line to measurements\nx = 0:10;\ny = 2.5*x + 1 + randn(1, 11);\np = polyfit(x, y, 1)\nscatter(x, y); hold on\nplot(x, polyval(p, x), 'r'); hold off\nlegend('data', 'fit'); title(sprintf('y = %.2f x + %.2f', p(1), p(2)))\n" },
];
const read = (): Script[] => { try { const v = JSON.parse(localStorage.getItem(KEEP) ?? 'null'); return Array.isArray(v) && v.length ? v : EXAMPLES; } catch { return EXAMPLES; } };
const lineOf = (code: string, at: number) => code.slice(0, at).split('\n').length;

export function LabApp() {
  const dark = useDarkMode(), wide = useMedia('(min-width: 1024px)');
  const kept = useSyncExternalStore(() => () => {}, () => { try { return localStorage.getItem(KEEP) ?? ''; } catch { return ''; } }, () => '');
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const list = scripts ?? (kept ? read() : EXAMPLES);
  const [open, setOpen] = useState(0);
  const [log, setLog] = useState<Line[]>([{ k: 'out', t: 'UniVerse Lab: type a command and press Enter, or run a script. Try  x = magic(4)  or  plot(1:10)\n' }]);
  const [vars, setVars] = useState<VarRow[]>([]);
  const [figs, setFigs] = useState<FigOut[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cmd, setCmd] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [tab, setTab] = useState<Tab>('command');
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; code: string; from: 'cmd' | 'script' } | null>(null);
  const logBox = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const save = (next: Script[]) => { setScripts(next); try { localStorage.setItem(KEEP, JSON.stringify(next)); } catch { /* private mode */ } };
  const print = (l: Line) => setLog((prev) => {
    if (l.t.includes('\f')) return [{ ...l, t: l.t.slice(l.t.lastIndexOf('\f') + 1) }].filter((x) => x.t);
    return [...prev.slice(-800), l];
  });

  const start = () => {
    const w = new Worker(new URL('./lab.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<FromLab>) => {
      const m = e.data;
      if ('out' in m) { print({ k: 'out', t: m.out }); return; }
      if ('fig' in m) { setFigs((fs) => fs.map((f) => (f.id === m.fig.id ? m.fig : f))); return; }
      const p = pending.current;
      if (m.error) print({ k: 'err', t: `Error${p?.from === 'script' && m.at !== undefined ? ` (line ${lineOf(p.code, m.at)})` : ''}: ${m.error}\n` });
      setVars(m.vars);
      // Figures only come back when a run changed them (null: keep what's shown).
      if (m.figs) { setFigs(m.figs); setCurrent(m.current); asked.current = ''; if (m.figs.length) setTab((t) => (t === 'editor' && p?.from === 'script' ? 'figure' : t)); }
      pending.current = null;
      setBusy(false);
    };
    worker.current = w;
  };
  const boot = useEffectEvent(() => start());
  useEffect(() => { boot(); return () => worker.current?.terminate(); }, []);
  useEffect(() => { logBox.current?.scrollTo({ top: logBox.current.scrollHeight }); }, [log]);

  const run = (code: string, from: 'cmd' | 'script') => {
    if (busy || !code.trim() || !worker.current) return;
    const id = ++seq.current;
    pending.current = { id, code, from };
    setBusy(true);
    print({ k: 'in', t: from === 'cmd' ? code : `>> run ${list[open]?.name ?? 'script'}` });
    worker.current.postMessage({ run: code, id } satisfies ToLab);
  };
  const stop = () => {
    worker.current?.terminate(); start();
    setBusy(false); setVars([]); pending.current = null;
    print({ k: 'err', t: 'Stopped. The variables were cleared (the engine was restarted).\n' });
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
  const editScript = (code: string) => save(list.map((s, i) => (i === open ? { ...s, code } : s)));

  const panel = 'panel flex min-h-0 flex-col overflow-hidden p-0';
  const head = 'flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 text-[13px] font-semibold text-zinc-800 dark:border-white/10 dark:text-zinc-100';
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';

  const command = (
    <section className={cn(panel, 'h-full')} aria-label="Command window">
      <div className={head}>Command window{busy && <span className="ms-auto inline-flex items-center gap-2 text-xs font-normal text-zinc-500">running…<button type="button" onClick={stop} className={btn}><Square className="h-3.5 w-3.5" aria-hidden />Stop</button></span>}</div>
      <div ref={logBox} role="log" aria-label="Output" tabIndex={0} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[13px] leading-relaxed" data-no-motion>
        {log.map((l, i) => <pre key={i} className={cn('whitespace-pre-wrap break-words', l.k === 'in' ? 'text-zinc-500 dark:text-zinc-400' : l.k === 'err' ? 'text-red-700 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100')}>{l.k === 'in' && !l.t.startsWith('>>') ? `>> ${l.t}` : l.t}</pre>)}
      </div>
      <div className="flex items-start gap-2 border-t border-zinc-200/80 px-3 py-2 font-mono text-[13px] dark:border-white/10">
        <span aria-hidden className="pt-1 text-zinc-500">&gt;&gt;</span>
        <textarea value={cmd} rows={Math.min(6, cmd.split('\n').length)} onChange={(e) => setCmd(e.target.value)} aria-label="Command" spellCheck={false} placeholder="Type a command, then Enter"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
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
      <textarea value={script.code} onChange={(e) => editScript(e.target.value)} aria-label={`Code of ${script.name}`} spellCheck={false}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(script.code, 'script'); }
          else if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget, s = t.selectionStart; editScript(`${script.code.slice(0, s)}    ${script.code.slice(t.selectionEnd)}`); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4; }); }
        }}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent p-3 font-mono text-[13px] leading-relaxed text-zinc-900 outline-none focus-visible:shadow-none! dark:text-zinc-100" />
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
                  <td className="px-3 py-1.5"><button type="button" className="font-mono font-semibold text-zinc-900 hover:underline dark:text-white" onClick={() => { setCmd((c) => c + v.name); setTab('command'); }} title={`${v.cls}: put ${v.name} in the command`}>{v.name}</button></td>
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
        <div ref={figBox} className="min-h-0 flex-1 p-2 [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-full" role="img" aria-label={`Figure ${fig.id}`} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : <p className="p-3 text-[13px] text-zinc-500 dark:text-zinc-400">Figures appear here. Try plot(1:10) in the command window.</p>}
    </section>
  );

  return (
    <div className="flex h-[calc(100dvh-10.5rem+var(--bare-gain,0px))] min-h-[30rem] flex-col gap-3">
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_minmax(22rem,30rem)] gap-3">
          {variables}
          <div className="grid min-h-0 grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">{editor}{command}</div>
          {figure}
        </div>
      ) : (
        <>
          <Segmented<Tab> label="Lab part" value={tab} onChange={setTab} segments={[{ value: 'command', label: 'Command' }, { value: 'editor', label: 'Editor' }, { value: 'variables', label: 'Variables' }, { value: 'figure', label: 'Figure' }]} />
          <div className="min-h-0 flex-1">{tab === 'command' ? command : tab === 'editor' ? editor : tab === 'variables' ? variables : figure}</div>
        </>
      )}
    </div>
  );
}
