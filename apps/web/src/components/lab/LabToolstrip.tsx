'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, BookOpen, Box, BrainCircuit, ChartArea, ChartBar, ChartColumn, ChartLine, ChartPie, ChartScatter, ChartSpline, ChevronDown, ChevronUp, CircuitBoard, Compass, Eraser,
  Eye, FileCode, FileDown, FileInput, FilePlus, FolderOpen, GitCompareArrows, GraduationCap, Grid3x3, Image as ImageIcon, Layers, Mountain, PanelsTopLeft, Play, Save, ScanSearch,
  Search, Settings2, Sigma, Square, SquareTerminal, Thermometer, Timer, Wind, Workflow,
  Download, Variable, List, NotebookPen, Lightbulb, PanelTop, Pin, PinOff, Grid2x2, Palette, Maximize2, Ratio, Heading, MoveHorizontal, MoveVertical, Tags, XSquare,
  Calculator, TrendingUp, AudioWaveform, Spline, ArrowDownUp, Ruler, Shuffle, BarChart, Infinity as InfinityIcon, Gauge, Cpu, Radio, Radar, Zap, Battery, ScanEye, FunctionSquare,
} from 'lucide-react';
import { Menu, Popover } from '@/components/ui/Menu';
import { cn } from '@/lib/utils';
import { LANGS, type LangId } from '@/lib/lab/langs';
import { findInScripts, lineDiff } from '@/lib/lab/diff';

// Hyperion's toolstrip (M472, the owner, 23 Nov, with a picture of a desktop maths program's ribbon: "my other agent
// didnt add all these tools in the hyperion website and downloaded app"). Our own design: three tabs of grouped tools
// over the Code window. Home: files (new in any language, open, find in every script, compare two), data (import, save
// and load the workspace, clear it), code (analyse, run and time, watch, stop, clear the command window), Simulate,
// the layout and preferences, help, examples and Learn. Plots: a gallery that draws the chosen variables. Apps:
// Hyperion's windows. A search box for help at the end of the tab row. It folds away to one row.

type Tab = 'home' | 'plots' | 'analyse' | 'apps';
export interface Layout { side: boolean; figure: boolean; codeSize: number }
export const LAYOUT_START: Layout = { side: true, figure: true, codeSize: 13 };

interface Props {
  busy: boolean;
  matlab: boolean;
  varsAreMatlab: boolean;
  vars: { name: string; size: string; cls: string }[];
  scripts: { name: string; code: string }[];
  open: number;
  examples: { name: string; code: string }[];
  layout: Layout;
  onLayout: (l: Layout) => void;
  onNew: (lang: LangId) => void;
  onOpenFiles: (files: FileList) => void;
  onJump: (script: number, line: number) => void;
  onImport: () => void;
  onCommand: (code: string) => void;
  onClearLog: () => void;
  onAnalyze: () => void;
  onRun: () => void;
  onTime: () => void;
  onWatch: () => void;
  onStop: () => void;
  onHelp: (query: string) => void;
  onExample: (index: number) => void;
  /** M472 (more): the script as a file, and the Notebook and Explain views of a MATLAB script. */
  onDownload: () => void;
  notebook: boolean; onNotebook: () => void;
  explain: boolean; onExplain: () => void;
}

const KEEP = 'uv-lab-strip';
const big = 'flex min-w-[3.4rem] flex-col items-center gap-0.5 rounded-md px-1 py-1 text-center text-[11px] font-medium leading-[1.15] text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';
const small = 'flex w-full items-center gap-1 rounded-md px-1 py-[3px] text-start text-[11px] leading-tight font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';
const iconBig = 'h-4 w-4 text-violet-600 dark:text-violet-300';
const iconSmall = 'h-3 w-3 shrink-0 text-violet-600 dark:text-violet-300';

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col border-e border-zinc-200/80 px-1.5 last:border-e-0 dark:border-white/10">
      <div className="flex min-h-[2.9rem] items-start gap-0">{children}</div>
      <div className="text-center text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  );
}
/** The shared menu button's own size and padding taken off, so a menu looks like the strip's other buttons. */
const bare = 'h-auto min-w-0 p-0 items-start justify-start hover:bg-transparent dark:hover:bg-transparent';
const Stack = ({ children }: { children: ReactNode }) => <div className="flex w-[7.6rem] flex-col gap-0">{children}</div>;

/** MATLAB text in quotes (a quote inside doubled). */
const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
/** A tool that asks for one line first (a title, a variable), then runs. */
function Ask({ label, icon, placeholder, hint, disabled, onRun }: { label: string; icon: ReactNode; placeholder: string; hint?: string; disabled?: boolean; onRun: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <Popover label={label} disabled={disabled} className={cn(bare, 'w-full')} button={<span className={small}>{icon}{label}</span>}>
      {(close) => (
        <form className="w-72 p-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onRun(v.trim()); close(); } }}>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} className="input w-full font-mono text-[13px]" />
          {hint && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</p>}
          <button type="submit" className="btn-primary btn-sm mt-2">OK</button>
        </form>
      )}
    </Popover>
  );
}

/** The plot gallery: each kind, how many variables it needs, and the line it runs. */
const PLOTS: { name: string; icon: ReactNode; cmd: (y: string, x: string) => string; needsX?: boolean; matrix?: boolean }[] = [
  { name: 'Line', icon: <ChartLine className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `plot(${x}, ${y})` : `plot(${y})`) },
  { name: 'Scatter', icon: <ChartScatter className={iconBig} aria-hidden />, cmd: (y, x) => `scatter(${x || `1:numel(${y})`}, ${y})` },
  { name: 'Bar', icon: <ChartColumn className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `bar(${x}, ${y})` : `bar(${y})`) },
  { name: 'Horizontal bar', icon: <ChartBar className={iconBig} aria-hidden />, cmd: (y) => `barh(${y})` },
  { name: 'Area', icon: <ChartArea className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `area(${x}, ${y})` : `area(${y})`) },
  { name: 'Stairs', icon: <ChartSpline className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `stairs(${x}, ${y})` : `stairs(${y})`) },
  { name: 'Stem', icon: <Activity className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `stem(${x}, ${y})` : `stem(${y})`) },
  { name: 'Histogram', icon: <ChartColumn className={iconBig} aria-hidden />, cmd: (y) => `histogram(${y})` },
  { name: 'Pie', icon: <ChartPie className={iconBig} aria-hidden />, cmd: (y) => `pie(${y})` },
  { name: 'Box plot', icon: <Box className={iconBig} aria-hidden />, cmd: (y) => `boxplot(${y})` },
  { name: 'Log scale', icon: <ChartLine className={iconBig} aria-hidden />, cmd: (y, x) => (x ? `semilogy(${x}, ${y})` : `semilogy(${y})`) },
  { name: 'Polar', icon: <Compass className={iconBig} aria-hidden />, cmd: (y, x) => `polarplot(${x || `linspace(0, 2*pi, numel(${y}))`}, ${y})` },
  { name: 'Surface', icon: <Mountain className={iconBig} aria-hidden />, cmd: (y) => `surf(${y})`, matrix: true },
  { name: 'Mesh', icon: <Grid3x3 className={iconBig} aria-hidden />, cmd: (y) => `mesh(${y})`, matrix: true },
  { name: 'Contour', icon: <Layers className={iconBig} aria-hidden />, cmd: (y) => `contour(${y})`, matrix: true },
  { name: 'Filled contour', icon: <Layers className={iconBig} aria-hidden />, cmd: (y) => `contourf(${y})`, matrix: true },
  { name: 'Image', icon: <ImageIcon className={iconBig} aria-hidden />, cmd: (y) => `imagesc(${y}); colorbar`, matrix: true },
  { name: 'Waterfall', icon: <Mountain className={iconBig} aria-hidden />, cmd: (y) => `waterfall(${y})`, matrix: true },
];
const numeric = (cls: string) => /^(double|single|u?int\d+|logical)$/.test(cls);
const isMatrix = (size: string) => { const d = size.split('×').map(Number); return d.length >= 2 && d[0] > 1 && d[1] > 1; };

export function LabToolstrip(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('home');
  const [folded, setFoldedNow] = useState(() => { try { return localStorage.getItem(KEEP) === 'folded'; } catch { return false; } });
  const setFolded = (v: boolean) => { setFoldedNow(v); try { localStorage.setItem(KEEP, v ? 'folded' : 'open'); } catch { /* private mode */ } };
  const [help, setHelp] = useState('');
  const [find, setFind] = useState('');
  const [other, setOther] = useState(-1);
  const opener = useRef<HTMLInputElement>(null);
  const [plotY, setPlotY] = useState(''), [plotX, setPlotX] = useState('');
  const plotVars = p.varsAreMatlab ? p.vars.filter((v) => numeric(v.cls)) : [];
  const y = plotVars.some((v) => v.name === plotY) ? plotY : plotVars[0]?.name ?? '';
  const x = plotVars.some((v) => v.name === plotX) && plotX !== y ? plotX : '';
  const yMatrix = isMatrix(plotVars.find((v) => v.name === y)?.size ?? '');
  const hits = useMemo(() => findInScripts(p.scripts, find, 60), [p.scripts, find]);
  const compareWith = other >= 0 && other !== p.open && other < p.scripts.length ? other : -1;
  const diff = useMemo(() => (compareWith >= 0 ? lineDiff(p.scripts[compareWith].code, p.scripts[p.open]?.code ?? '') : []), [compareWith, p.scripts, p.open]);
  const go = (path: string, key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } router.push(path); };

  const tabs: { id: Tab; label: string }[] = [{ id: 'home', label: 'Home' }, { id: 'plots', label: 'Plots' }, { id: 'analyse', label: 'Analyse' }, { id: 'apps', label: 'Apps' }];
  const home = (
    <>
      <Group label="File">
        <Menu label="New script in" className={bare} button={<span className={big}><FilePlus className={iconBig} aria-hidden />New script</span>}
          items={LANGS.map((l) => ({ label: `${l.name} (${l.ext})${l.where === 'computer' ? ', computer app' : ''}`, onSelect: () => p.onNew(l.id) }))} />
        <button type="button" className={big} onClick={() => opener.current?.click()}><FolderOpen className={iconBig} aria-hidden />Open</button>
        <input ref={opener} type="file" multiple accept=".m,.py,.R,.r,.jl,.cpp,.cc,.rs,.txt" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { if (e.target.files?.length) p.onOpenFiles(e.target.files); e.target.value = ''; }} />
        <Stack>
          <Popover label="Find in scripts" className={cn(bare, 'w-full')} wide button={<span className={small}><Search className={iconSmall} aria-hidden />Find in scripts</span>}>
            {(close) => (
              <div className="w-[26rem] max-w-[90vw] p-2">
                <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="A word or a name" aria-label="Find in every script" className="input w-full" />
                <ul className="mt-2 max-h-72 overflow-y-auto text-[13px]" aria-live="polite">
                  {find.trim() && !hits.length && <li className="px-2 py-1 text-zinc-500 dark:text-zinc-400">Not found in any script.</li>}
                  {hits.map((h, i) => (
                    <li key={i}><button type="button" className="flex w-full gap-2 rounded-md px-2 py-1 text-start hover:bg-zinc-100 dark:hover:bg-white/[0.08]" onClick={() => { p.onJump(h.script, h.line); close(); }}>
                      <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400" translate="no">{h.name}:{h.line}</span><span className="truncate font-mono text-xs" translate="no">{h.text}</span>
                    </button></li>
                  ))}
                </ul>
              </div>
            )}
          </Popover>
          <Popover label="Compare" className={cn(bare, 'w-full')} wide button={<span className={small}><GitCompareArrows className={iconSmall} aria-hidden />Compare</span>}>
            {() => (
              <div className="w-[40rem] max-w-[92vw] p-2">
                <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200">Compare <b translate="no">{p.scripts[p.open]?.name}</b> with
                  <select value={compareWith} onChange={(e) => setOther(Number(e.target.value))} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[13px] dark:border-white/15 dark:bg-white/[0.06]">
                    <option value={-1}>choose a script…</option>
                    {p.scripts.map((s, i) => (i === p.open ? null : <option key={i} value={i}>{s.name}</option>))}
                  </select>
                </label>
                {compareWith >= 0 && (
                  <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-zinc-200 font-mono text-[12px] dark:border-white/10" role="table" aria-label="Lines taken out and put in">
                    {diff.every((d) => d.kind === 'same') ? <p className="p-2 font-sans text-[13px] text-zinc-600 dark:text-zinc-300">The two scripts are the same.</p> : diff.map((d, i) => (
                      <div key={i} role="row" className={cn('flex gap-2 px-2 whitespace-pre', d.kind === 'gone' ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200' : d.kind === 'new' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'text-zinc-600 dark:text-zinc-300')}>
                        <span role="cell" className="w-4 shrink-0" aria-label={d.kind === 'gone' ? 'only in the other script' : d.kind === 'new' ? 'only in this script' : 'in both'}>{d.kind === 'gone' ? '−' : d.kind === 'new' ? '+' : ' '}</span>
                        <span role="cell" translate="no">{d.text || ' '}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Popover>
          <button type="button" className={small} onClick={p.onDownload}><Download className={iconSmall} aria-hidden />Download script</button>
        </Stack>
      </Group>
      <Group label="Data">
        <button type="button" className={big} onClick={p.onImport}><FileInput className={iconBig} aria-hidden />Import data</button>
        <Stack>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand("save('workspace.mat')")} title="Keeps every variable in workspace.mat, in Files"><Save className={iconSmall} aria-hidden />Save workspace</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand("load('workspace.mat')")} title="Brings back the variables saved in workspace.mat"><FileDown className={iconSmall} aria-hidden />Load workspace</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('clear')}><Eraser className={iconSmall} aria-hidden />Clear workspace</button>
        </Stack>
        <Stack>
          <Ask label="New variable" icon={<Variable className={iconSmall} aria-hidden />} placeholder="a = [1 2 3; 4 5 6]" hint="A name, =, and its value." disabled={p.busy} onRun={(t) => p.onCommand(t.includes('=') ? t : `ans = ${t}`)} />
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('whos')}><List className={iconSmall} aria-hidden />List variables</button>
        </Stack>
      </Group>
      <Group label="Code">
        <button type="button" className={cn(big, 'text-zinc-900 dark:text-white')} disabled={p.busy} onClick={p.onRun}><Play className={iconBig} aria-hidden />Run</button>
        <Stack>
          <button type="button" className={small} disabled={!p.matlab} onClick={p.onAnalyze} title={p.matlab ? 'What a careful reader would point out in this script' : 'For MATLAB scripts'}><ScanSearch className={iconSmall} aria-hidden />Analyse code</button>
          <button type="button" className={small} disabled={!p.matlab || p.busy} onClick={p.onTime}><Timer className={iconSmall} aria-hidden />Run and time</button>
          <button type="button" className={small} disabled={!p.matlab || p.busy} onClick={p.onWatch}><Eye className={iconSmall} aria-hidden />Run step by step</button>
        </Stack>
        <Stack>
          <button type="button" className={small} disabled={!p.busy} onClick={p.onStop}><Square className={iconSmall} aria-hidden />Stop</button>
          <button type="button" className={small} onClick={p.onClearLog}><SquareTerminal className={iconSmall} aria-hidden />Clear commands</button>
          <button type="button" className={small} disabled={!p.matlab} aria-pressed={p.explain} onClick={p.onExplain}><Lightbulb className={iconSmall} aria-hidden />{p.explain ? 'Hide explanations' : 'Explain each line'}</button>
        </Stack>
        <Stack>
          <button type="button" className={small} disabled={!p.matlab} aria-pressed={p.notebook} onClick={p.onNotebook}><NotebookPen className={iconSmall} aria-hidden />{p.notebook ? 'Back to the code' : 'Notebook view'}</button>
        </Stack>
      </Group>
      <Group label="Simulate">
        <button type="button" className={big} onClick={() => router.push('/hyperion/simulate')}><Workflow className={iconBig} aria-hidden />Simulate</button>
      </Group>
      <Group label="Environment">
        <Menu label="Layout" className={bare} button={<span className={big}><PanelsTopLeft className={iconBig} aria-hidden />Layout</span>} items={[
          { label: 'Variables and Files', checked: p.layout.side, onSelect: () => p.onLayout({ ...p.layout, side: !p.layout.side }) },
          { label: 'Figure', checked: p.layout.figure, onSelect: () => p.onLayout({ ...p.layout, figure: !p.layout.figure }) },
          'sep',
          { label: 'Put the layout back', onSelect: () => p.onLayout(LAYOUT_START) },
        ]} />
        <Menu label="Preferences" className={bare} button={<span className={big}><Settings2 className={iconBig} aria-hidden />Preferences</span>} items={[
          { heading: 'Code text size' },
          ...[12, 13, 15, 17].map((s) => ({ label: s === 13 ? `${s} px (usual)` : `${s} px`, checked: p.layout.codeSize === s, onSelect: () => p.onLayout({ ...p.layout, codeSize: s }) })),
        ]} />
      </Group>
      <Group label="Resources">
        <button type="button" className={big} onClick={() => p.onHelp('')}><BookOpen className={iconBig} aria-hidden />Help</button>
        <Menu label="Examples" className={bare} button={<span className={big}><FileCode className={iconBig} aria-hidden />Examples</span>} items={p.examples.map((e, i) => ({ label: e.name, onSelect: () => p.onExample(i) }))} />
        <button type="button" className={big} onClick={() => router.push('/hyperion/learn')}><GraduationCap className={iconBig} aria-hidden />Learn</button>
      </Group>
    </>
  );

  const varPicker = (
        <div className="flex w-44 flex-col gap-1 text-[11px] text-zinc-700 dark:text-zinc-200">
          {plotVars.length ? (
            <>
              <label className="flex items-center gap-1.5">Draw
                <select value={y} onChange={(e) => setPlotY(e.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-1 py-0 font-mono dark:border-white/15 dark:bg-white/[0.06]" translate="no">
                  {plotVars.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.size})</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">against
                <select value={x} onChange={(e) => setPlotX(e.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-1 py-0 font-mono dark:border-white/15 dark:bg-white/[0.06]" translate="no">
                  <option value="">its position</option>
                  {plotVars.filter((v) => v.name !== y).map((v) => <option key={v.name} value={v.name}>{v.name} ({v.size})</option>)}
                </select>
              </label>
            </>
          ) : <p className="leading-snug text-zinc-500 dark:text-zinc-400">{p.varsAreMatlab ? 'Make a variable first, like x = linspace(0, 10, 100); y = sin(x)' : 'The gallery draws Hyperion’s own (MATLAB) variables: run a .m script first.'}</p>}
        </div>
  );

  const plots = (
    <>
      <Group label="Variables">
        {varPicker}
      </Group>
      <Group label="Draw">
        <div className="flex gap-0.5">
          {PLOTS.map((k) => {
            const ok = !!y && !p.busy && (!k.matrix || yMatrix);
            return (
              <button key={k.name} type="button" className={big} disabled={!ok} title={y ? `figure; ${k.cmd(y, x)}` : undefined} onClick={() => p.onCommand(`figure; ${k.cmd(y, x)}`)}>
                {k.icon}{k.name}
              </button>
            );
          })}
        </div>
      </Group>
      <Group label="Figure">
        <Stack>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('figure')}><PanelTop className={iconSmall} aria-hidden />New figure</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('hold on')}><Pin className={iconSmall} aria-hidden />Hold on (add to it)</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('hold off')}><PinOff className={iconSmall} aria-hidden />Hold off</button>
        </Stack>
        <Stack>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('grid on')}><Grid2x2 className={iconSmall} aria-hidden />Grid</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('colorbar')}><Palette className={iconSmall} aria-hidden />Colour bar</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('close all')}><XSquare className={iconSmall} aria-hidden />Close all</button>
        </Stack>
        <Stack>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('axis tight')}><Maximize2 className={iconSmall} aria-hidden />Axes fit the data</button>
          <button type="button" className={small} disabled={p.busy} onClick={() => p.onCommand('axis equal')}><Ratio className={iconSmall} aria-hidden />Equal axes</button>
        </Stack>
      </Group>
      <Group label="Labels">
        <Stack>
          <Ask label="Title" icon={<Heading className={iconSmall} aria-hidden />} placeholder="Temperature over a day" disabled={p.busy} onRun={(t) => p.onCommand(`title(${q(t)})`)} />
          <Ask label="X label" icon={<MoveHorizontal className={iconSmall} aria-hidden />} placeholder="Time (s)" disabled={p.busy} onRun={(t) => p.onCommand(`xlabel(${q(t)})`)} />
          <Ask label="Y label" icon={<MoveVertical className={iconSmall} aria-hidden />} placeholder="Height (m)" disabled={p.busy} onRun={(t) => p.onCommand(`ylabel(${q(t)})`)} />
        </Stack>
        <Stack>
          <Ask label="Legend" icon={<Tags className={iconSmall} aria-hidden />} placeholder="data, fit" hint="The lines' names, separated by commas." disabled={p.busy} onRun={(t) => p.onCommand(`legend(${t.split(',').map((x) => q(x.trim())).join(', ')})`)} />
        </Stack>
      </Group>
    </>
  );

  // Analyse (M472, more): one click on the chosen variable; results print and new variables appear.
  const X = x || `(1:numel(${y}))`;
  const ANALYSE: { name: string; icon: ReactNode; cmd: string; needsX?: boolean }[] = y ? [
    { name: 'Statistics', icon: <Calculator className={iconBig} aria-hidden />, cmd: `fprintf('${y}: min %g, max %g, mean %g, median %g, std %g, rms %g\\n', min(${y}(:)), max(${y}(:)), mean(${y}(:)), median(${y}(:)), std(${y}(:)), rms(${y}(:)))` },
    { name: 'Fit a line', icon: <TrendingUp className={iconBig} aria-hidden />, cmd: `p_${y} = polyfit(${X}(:), ${y}(:), 1); figure; scatter(${X}(:), ${y}(:)); hold on; plot(${X}(:), polyval(p_${y}, ${X}(:))); hold off; title(sprintf('y = %.4g x + %.4g', p_${y}(1), p_${y}(2)))` },
    { name: 'Fit a curve', icon: <Spline className={iconBig} aria-hidden />, cmd: `p_${y} = polyfit(${X}(:), ${y}(:), 3); figure; scatter(${X}(:), ${y}(:)); hold on; plot(${X}(:), polyval(p_${y}, ${X}(:))); hold off; title('A cubic through the data')` },
    { name: 'Spectrum', icon: <AudioWaveform className={iconBig} aria-hidden />, cmd: `S_${y} = abs(fft(${y}(:))); figure; plot(S_${y}(1:floor(end/2))); title('Spectrum (how much of each frequency)'); xlabel('Frequency bin')` },
    { name: 'Smooth', icon: <ChartSpline className={iconBig} aria-hidden />, cmd: `${y}_smooth = movmean(${y}, 5); figure; plot(${y}); hold on; plot(${y}_smooth); hold off; legend('data', 'smoothed')` },
    { name: 'Slope', icon: <TrendingUp className={iconBig} aria-hidden />, cmd: `${y}_slope = diff(${y}(:)) ./ diff(${X}(:)); figure; plot(${y}_slope); title('Slope (derivative)')` },
    { name: 'Area under', icon: <ChartArea className={iconBig} aria-hidden />, cmd: `${y}_area = trapz(${X}(:), ${y}(:))` },
    { name: 'Running total', icon: <Sigma className={iconBig} aria-hidden />, cmd: `${y}_total = cumsum(${y}); figure; plot(${y}_total); title('Running total')` },
    { name: 'Sort', icon: <ArrowDownUp className={iconBig} aria-hidden />, cmd: `${y}_sorted = sort(${y})` },
    { name: 'Counts', icon: <BarChart className={iconBig} aria-hidden />, cmd: `[${y}_counts, ${y}_edges] = histcounts(${y})` },
    { name: 'Correlation', icon: <Shuffle className={iconBig} aria-hidden />, cmd: `R = corrcoef(${x}(:), ${y}(:))`, needsX: true },
    { name: 'Range', icon: <Ruler className={iconBig} aria-hidden />, cmd: `${y}_range = max(${y}(:)) - min(${y}(:))` },
  ] : [];
  const analyse = (
    <>
      <Group label="Variables">{varPicker}</Group>
      <Group label="Calculate">
        <div className="flex gap-0">
          {ANALYSE.length ? ANALYSE.map((k) => (
            <button key={k.name} type="button" className={big} disabled={p.busy || (k.needsX && !x)} title={k.needsX && !x ? 'Choose what to compare it with ("against")' : k.cmd} onClick={() => p.onCommand(k.cmd)}>{k.icon}{k.name}</button>
          )) : <p className="px-2 py-2 text-[11px] text-zinc-500 dark:text-zinc-400">Make a variable first (Home → New variable), then pick it here.</p>}
        </div>
      </Group>
    </>
  );

  const apps = (
    <>
      <Group label="Simulate">
        {([['structures', 'Structures', Box], ['heat', 'Heat', Thermometer], ['fluids', 'Fluids', Wind], ['circuits', 'Circuits', CircuitBoard], ['blocks', 'Blocks', Workflow]] as const).map(([id, name, Icon]) => (
          <button key={id} type="button" className={big} onClick={() => go('/hyperion/simulate', 'uv-sim-kind', id)}><Icon className={iconBig} aria-hidden />{name}</button>
        ))}
      </Group>
      <Group label="Learn">
        <button type="button" className={big} onClick={() => go('/hyperion/learn', 'uv-learn-tab', 'classify')}><BrainCircuit className={iconBig} aria-hidden />Classify</button>
        <button type="button" className={big} onClick={() => go('/hyperion/learn', 'uv-learn-tab', 'health')}><Activity className={iconBig} aria-hidden />Machine health</button>
      </Group>
      <Group label="Toolbox starters">
        {([['symbolic.m', 'Symbolic maths', FunctionSquare], ['control.m', 'Control', Gauge], ['optim.m', 'Optimise', InfinityIcon], ['learn.m', 'Machine learning', Cpu], ['images.m', 'Images', ScanEye], ['vibration.m', 'Vibration', AudioWaveform], ['comms.m', 'Wireless', Radio], ['radar.m', 'Radar', Radar], ['energy.m', 'Energy', Battery], ['grid.m', 'Power grid', Zap], ['python_demo.py', 'Python', FileCode], ['r_demo.R', 'R', FileCode]] as const).map(([file, name, Icon]) => {
          const i = p.examples.findIndex((e) => e.name === file);
          return i < 0 ? null : <button key={file} type="button" className={big} onClick={() => p.onExample(i)} title={`Opens ${file}, a working example to start from`}><Icon className={iconBig} aria-hidden />{name}</button>;
        })}
      </Group>
      <Group label="In this window">
        <button type="button" className={big} onClick={() => p.onHelp('')}><Sigma className={iconBig} aria-hidden />Functions</button>
        <button type="button" className={big} onClick={p.onImport}><FileInput className={iconBig} aria-hidden />Import data</button>
      </Group>
    </>
  );

  return (
    <section className="panel shrink-0 overflow-hidden p-0" aria-label="Toolstrip" data-no-motion data-no-arrange>
      <div className="flex items-center gap-1 border-b border-zinc-200/80 px-2 dark:border-white/10">
        <div role="tablist" aria-label="Tools" className="flex">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`lab-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="lab-strip-panel" onClick={() => { setTab(t.id); if (folded) setFolded(false); }}
              className={cn('relative px-2.5 py-1.5 text-[12px] font-semibold', tab === t.id ? 'text-zinc-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet-600 dark:text-white dark:after:bg-violet-400' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100')}>
              {t.label}
            </button>
          ))}
        </div>
        <form className="ms-auto flex items-center" role="search" onSubmit={(e) => { e.preventDefault(); p.onHelp(help); }}>
          <label className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 dark:border-white/15 dark:bg-white/[0.06]">
            <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            <input value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Search help" aria-label="Search help" className="w-40 bg-transparent text-[12px] outline-none placeholder:text-zinc-500" />
          </label>
        </form>
        <button type="button" className="rounded-md p-1 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]" aria-expanded={!folded} aria-controls="lab-strip-panel" onClick={() => setFolded(!folded)} title={folded ? 'Show the tools' : 'Fold the tools away'}>
          {folded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}<span className="sr-only">{folded ? 'Show the tools' : 'Fold the tools away'}</span>
        </button>
      </div>
      {!folded && (
        <div id="lab-strip-panel" role="tabpanel" aria-labelledby={`lab-tab-${tab}`} className="flex items-stretch overflow-x-auto px-0.5 py-1 [scrollbar-width:thin]">
          {tab === 'home' ? home : tab === 'plots' ? plots : tab === 'analyse' ? analyse : apps}
        </div>
      )}
    </section>
  );
}
