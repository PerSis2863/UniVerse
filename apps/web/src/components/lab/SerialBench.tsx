'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Cable, Code2, Cpu, Download, Plug, Send, Trash2, Unplug } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { Fill } from '@/components/ui/Fill';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { parsePlotLine, type Mode } from '@/lib/lab/firmata';
import { shareFragment } from '@/lib/lab/share';
import { ui } from '@/components/sim/bench-ui';
import { keep } from './lab-files';
import { pinName, serialLink, serialSupported, type LinkState } from './serial-link';

// Hyperion Signals → Devices (M474): serial devices and Arduino boards over Web Serial, or a simulated Arduino. Text
// mode is a serial monitor and plotter (lines as "temp:21.5,light:300" or "1 2 3" are drawn live) with a terminal to
// send commands; Firmata mode (the StandardFirmata sketch) shows every pin: set its mode, switch outputs, drag PWM,
// watch inputs and analog voltages. The data logger saves the plotted numbers as CSV. Scripts in the Code window use
// the same connection (serialport / readline / writeline, arduino / writeDigitalPin / readVoltage…).

type Tab = 'text' | 'firmata';
const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 1000000];
const KEEP_POINTS = 300;
const COLOURS = { light: ['#7c3aed', '#ea580c', '#16a34a', '#2563eb', '#dc2626', '#0891b2'], dark: ['#a78bfa', '#fb923c', '#4ade80', '#60a5fa', '#f87171', '#22d3ee'] };
const MODE_LABEL: Record<Mode, string> = { input: 'Digital input', output: 'Digital output', analog: 'Analog input', pwm: 'PWM', servo: 'Servo', pullup: 'Input with pull-up' };
const stamp = () => new Date().toTimeString().slice(0, 8).replace(/:/g, '');
const clock = () => performance.now();

function useLink(): LinkState {
  return useSyncExternalStore((cb) => serialLink.subscribe((e) => { if (e.state) cb(); }), () => serialLink.state, () => serialLink.state);
}

export function SerialBench() {
  const dark = useDarkMode(), router = useRouter(), link = useLink();
  const [mode, setMode] = useState<Tab>('text');
  const [baud, setBaud] = useState(115200);
  const [supported] = useState(serialSupported);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>(() => serialLink.lines.slice(-200));
  const [series, setSeries] = useState<{ names: string[]; t: number[]; v: number[][] }>({ names: [], t: [], v: [] });
  const [say, setSay] = useState('');
  const [ending, setEnding] = useState('\n');
  const [logging, setLogging] = useState(false);
  const [rows, setRows] = useState<{ t: number; m: Record<string, number> }[]>([]);
  const [logNames, setLogNames] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const t0 = useRef(clock()), logRef = useRef(logging), term = useRef<HTMLPreElement>(null);
  useEffect(() => { logRef.current = logging; }, [logging]);
  const colours = dark ? COLOURS.dark : COLOURS.light;

  // New lines: the terminal, the plotter's series and, while logging, the table.
  useEffect(() => serialLink.subscribe((e) => {
    if (!e.lines) return;
    if (!e.lines.length) { setLines([]); return; }
    setLines((old) => [...old, ...e.lines!].slice(-200));
    const t = (clock() - t0.current) / 1000;
    const parsed = e.lines.map(parsePlotLine).filter((p): p is NonNullable<typeof p> => !!p);
    if (!parsed.length) return;
    setSeries((s) => {
      const names = [...s.names], v = s.v.map((x) => [...x]), times = [...s.t];
      for (const p of parsed) {
        p.values.forEach((val, i) => {
          const name = p.names[i] ?? `value ${i + 1}`;
          let k = names.indexOf(name);
          if (k < 0) { if (names.length >= 6) return; names.push(name); v.push(times.map(() => NaN)); k = names.length - 1; }
          v[k].push(val);
        });
        times.push(t);
        for (const col of v) while (col.length < times.length) col.push(NaN);
      }
      const cut = Math.max(0, times.length - KEEP_POINTS);
      return { names, t: times.slice(cut), v: v.map((c) => c.slice(cut)) };
    });
    if (logRef.current) {
      const recs = parsed.map((p) => ({ t, m: Object.fromEntries(p.values.map((v, i) => [p.names[i] ?? `value ${i + 1}`, v])) }));
      setLogNames((old) => [...new Set([...old, ...recs.flatMap((r) => Object.keys(r.m))])]);
      setRows((r) => (r.length > 100_000 ? r : [...r, ...recs]));
    }
  }), []);
  useEffect(() => { const el = term.current; if (el) el.scrollTop = el.scrollHeight; }, [lines]);

  const connect = async (sim: boolean) => {
    setBusy(true);
    t0.current = clock(); setSeries({ names: [], t: [], v: [] }); setLines([]); serialLink.clearLines();
    try { await (sim ? serialLink.simulate(mode === 'firmata') : serialLink.connect(baud, mode === 'firmata')); } finally { setBusy(false); }
  };
  const send = () => { if (!say) return; void serialLink.writeText(say + ending); setSay(''); };
  const csv = () => {
    return `time_s,${logNames.map((n) => n.replace(/[^\w]+/g, '_')).join(',')}\n${rows.map((r) => [r.t.toFixed(3), ...logNames.map((n) => r.m[n] ?? '')].join(',')).join('\n')}\n`;
  };
  const downloadCsv = () => { const url = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'device-log.csv'; a.click(); URL.revokeObjectURL(url); };
  const saveLog = async () => { const name = `device-log-${stamp()}.csv`; await keep(name, new TextEncoder().encode(csv())); setSaved(name); };
  const openInCode = async () => router.push(`/hyperion#${await shareFragment({
    name: link.firmata ? 'arduino_pins.m' : 'serial_read.m', view: 'code',
    code: link.firmata
      ? `% The board connected in Signals → Devices (StandardFirmata). Scripts read the pins' last values and write as they run.\na = arduino();\nconfigurePin(a, 'D13', 'DigitalOutput');\nwriteDigitalPin(a, 'D13', 1)          % the built-in LED on\nwritePWMDutyCycle(a, 'D9', 0.4)        % 40% on pin 9\nv = readVoltage(a, 'A0');\nfprintf('A0 reads %.2f V\\n', v)\nbutton = readDigitalPin(a, 'D2')\n`
      : `% The device connected in Signals → Devices: read the lines it has sent so far\ns = serialport('${link.name || 'Simulated Arduino Uno'}', ${link.baud || 115200});\nwriteline(s, 'LED ON');                  % the simulated sketch answers it\nT = [];\nwhile true\n  line = readline(s);\n  if isempty(line), break, end\n  v = sscanf(strrep(regexprep(line, '[a-z]+:', ''), ',', ' '), '%f')';\n  if numel(v) >= 3, T(end+1, :) = v(1:3); end\nend\nplot(T); legend('temp', 'light', 'knob'); title(sprintf('%d readings', size(T, 1)))\n${saved ? `% Or the saved log: T = readtable('${saved}');\n` : ''}`,
  })}`);

  const { label, small } = ui;
  const notSupported = !supported;
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[32rem] gap-3">
      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Device" data-no-motion>
        <div>
          <p className={label}>Talk to it as</p>
          <div className="mt-1"><Segmented<Tab> label="Talk to it as" value={link.open ? (link.firmata ? 'firmata' : 'text') : mode} onChange={(v) => { if (!link.open) setMode(v); }} segments={[{ value: 'text', label: 'Text' }, { value: 'firmata', label: 'Firmata' }]} /></div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{(link.open ? link.firmata : mode === 'firmata') ? 'Upload File → Examples → Firmata → StandardFirmata to the board first; then every pin is yours from here.' : 'Lines the sketch prints (Serial.println) show and are plotted; send it commands.'}</p>
        </div>
        <label className={label}>Speed (baud)
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={link.open} className="input mt-1 w-full">{BAUDS.map((b) => <option key={b} value={b}>{b.toLocaleString()}</option>)}</select>
        </label>
        {link.open ? (
          <div className="space-y-2">
            <p className="rounded-lg bg-green-50 p-2.5 text-xs text-green-900 dark:bg-green-500/10 dark:text-green-200"><Plug className="me-1 inline h-3.5 w-3.5" aria-hidden />Connected: <b translate="no">{link.name}</b>{link.firmware ? ` · ${link.firmware}` : ''}{link.kind === 'serial' ? ` at ${link.baud.toLocaleString()} baud` : ''}</p>
            <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} onClick={() => void serialLink.close()}><Unplug className="h-3.5 w-3.5" aria-hidden />Disconnect</button>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" className="btn-primary inline-flex w-full items-center justify-center gap-1.5" disabled={notSupported || busy} onClick={() => void connect(false)}><Cable className="h-4 w-4" aria-hidden />Connect a device…</button>
            <button type="button" className={cn(small, 'w-full justify-center border border-zinc-200 dark:border-white/15')} disabled={busy} onClick={() => void connect(true)}><Cpu className="h-3.5 w-3.5" aria-hidden />Try a simulated Arduino</button>
          </div>
        )}
        {link.error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{link.error}</p>}
        <div className="mt-auto space-y-1 border-t border-zinc-200/80 pt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          <p><b className="font-medium text-zinc-700 dark:text-zinc-200">Which browsers:</b> plugging in devices works in Chrome, Edge and Opera on a computer, and in Hyperion’s computer app. Firefox and Safari don’t allow it{notSupported ? ' (this browser is one of them: the simulated Arduino still works)' : ''}.</p>
          <p>The browser asks which port to use each time; nothing is sent anywhere else.</p>
        </div>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label={link.firmata ? 'Pins' : 'Plotter and terminal'} data-no-motion>
        {link.open && link.firmata ? <Pins link={link} colours={colours} /> : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              {series.names.length ? series.names.map((n, i) => { const last = series.v[i]?.findLast((x) => Number.isFinite(x)); return <span key={n} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colours[i % colours.length] }} aria-hidden /><span translate="no">{n}</span> <b className="font-mono tabular-nums" data-series={n}>{last === undefined ? '–' : +last.toPrecision(5)}</b></span>; }) : <span>{link.open ? 'Waiting for numbers…' : 'Connect a device or try the simulated Arduino.'}</span>}
            </div>
            <div className="min-h-0 flex-[3]"><Plot series={series} colours={colours} /></div>
            <pre ref={term} className="min-h-0 flex-[2] overflow-auto rounded-xl bg-zinc-50 p-2.5 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-100" aria-label="What the device sent" tabIndex={0} translate="no">{lines.join('\n') || ' '}</pre>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input value={say} onChange={(e) => setSay(e.target.value)} disabled={!link.open} placeholder={link.kind === 'sim-text' ? 'Try LED ON' : 'A command for the device'} aria-label="A command for the device" className="input min-w-0 flex-1 font-mono" />
              <select value={ending} onChange={(e) => setEnding(e.target.value)} className={ui.select} aria-label="Line ending"><option value={'\n'}>New line</option><option value={'\r\n'}>CR + new line</option><option value="">No ending</option></select>
              <button type="submit" className={cn(small, 'border border-zinc-200 dark:border-white/15')} disabled={!link.open || !say}><Send className="h-3.5 w-3.5" aria-hidden />Send</button>
            </form>
          </>
        )}
      </section>

      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Data logger" data-no-motion>
        <p className={label}>Data logger</p>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">{link.firmata ? 'Firmata pins aren’t logged here: read them in a script (Open in Code).' : 'Every line with numbers becomes a row, with the time it arrived.'}</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} disabled={!link.open || link.firmata} aria-pressed={logging} onClick={() => setLogging((v) => !v)}>{logging ? 'Pause logging' : 'Start logging'}</button>
          <button type="button" className={small} disabled={!rows.length} onClick={() => { setRows([]); setLogNames([]); setSaved(''); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Clear</button>
        </div>
        <p className="text-xs text-zinc-600 dark:text-zinc-300"><b className="font-mono tabular-nums">{rows.length.toLocaleString()}</b> rows</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={small} disabled={!rows.length} onClick={downloadCsv}><Download className="h-3.5 w-3.5" aria-hidden />CSV</button>
          <button type="button" className={small} disabled={!rows.length} onClick={() => void saveLog()}>Save to Hyperion’s files</button>
        </div>
        {saved && <p className="text-xs text-zinc-500 dark:text-zinc-400">Saved as <span className="font-mono" translate="no">{saved}</span>.</p>}
        <div className="mt-auto border-t border-zinc-200/80 pt-3">
          <button type="button" className={small} disabled={!link.open} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Scripts use this connection while it stays open: {link.firmata ? 'arduino, writeDigitalPin, readVoltage…' : 'serialport, readline, writeline…'}</p>
        </div>
      </aside>
    </div>
  );
}

function Plot({ series, colours }: { series: { names: string[]; t: number[]; v: number[][] }; colours: string[] }) {
  const all = series.v.flat().filter(Number.isFinite);
  const range = useMemo(() => { if (!all.length) return null; let lo = Math.min(...all), hi = Math.max(...all); if (hi === lo) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.06; return { lo: lo - pad, hi: hi + pad }; }, [all]);
  const t0 = series.t[0] ?? 0, t1 = series.t[series.t.length - 1] ?? 1;
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * 1000, Y = (v: number) => (range ? (1 - (v - range.lo) / (range.hi - range.lo)) * 1000 : 500);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="flex w-12 shrink-0 flex-col justify-between py-0.5 text-end font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden><span>{range ? +range.hi.toPrecision(4) : ''}</span><span>{range ? +range.lo.toPrecision(4) : ''}</span></div>
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="h-full min-w-0 flex-1 rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={series.names.length ? `Live plot of ${series.names.join(', ')}` : 'Live plot: nothing yet'}>
          {series.v.map((col, i) => <path key={series.names[i]} d={col.map((v, k) => (Number.isFinite(v) ? `${k && Number.isFinite(col[k - 1]) ? 'L' : 'M'}${X(series.t[k]).toFixed(1)},${Y(v).toFixed(1)}` : '')).join('')} fill="none" stroke={colours[i % colours.length]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
      <div className="ms-[3.375rem] flex justify-between pt-1 font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400" aria-hidden><span>{series.t.length ? `${t0.toFixed(1)} s` : ''}</span><span>{series.t.length ? `${t1.toFixed(1)} s` : ''}</span></div>
    </div>
  );
}

function Pins({ link, colours }: { link: LinkState; colours: string[] }) {
  if (!link.pins.length) return <div className="grid h-full place-items-center text-xs text-zinc-500 dark:text-zinc-400">Asking the board which pins it has… (is StandardFirmata uploaded?)</div>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="text-xs text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Pin</th><th className="py-1 text-start font-medium">Mode</th><th className="py-1 text-start font-medium">Value</th></tr></thead>
        <tbody>
          {link.pins.map((p, i) => {
            const modes = Object.keys(p.modes) as Mode[];
            if (!modes.length) return null;
            const name = pinName(i, link.analogMap);
            return (
              <tr key={i} className="border-t border-zinc-100 dark:border-white/[0.06]">
                <td className="py-1.5 font-mono" translate="no">{name}</td>
                <td className="py-1.5">
                  <select value={p.mode ?? ''} onChange={(e) => void serialLink.pinMode(i, e.target.value as Mode)} className={ui.select} aria-label={`${name} mode`}>
                    <option value="" disabled>Choose…</option>
                    {modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                  </select>
                </td>
                <td className="py-1.5">
                  {p.mode === 'output' ? (
                    <button type="button" aria-pressed={p.value === 1} onClick={() => void serialLink.digitalWrite(i, p.value ? 0 : 1)} className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', p.value ? 'border-violet-400 bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-white' : 'border-zinc-200 text-zinc-700 dark:border-white/15 dark:text-zinc-200')}>{p.value ? 'High (on)' : 'Low (off)'}</button>
                  ) : p.mode === 'pwm' || p.mode === 'servo' ? (
                    <label className="flex items-center gap-2"><input type="range" min={0} max={p.mode === 'servo' ? 180 : 255} value={p.value} onChange={(e) => void serialLink.analogWrite(i, Number(e.target.value))} className="w-40 accent-violet-600" aria-label={`${name} ${p.mode === 'servo' ? 'angle' : 'duty'}`} /><span className="font-mono text-xs tabular-nums">{p.mode === 'servo' ? `${p.value}°` : `${Math.round((p.value / 255) * 100)}%`}</span></label>
                  ) : p.mode === 'analog' ? (
                    <span className="flex items-center gap-2"><span className="block h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"><Fill value={p.value / 1023} quick className="bg-violet-600 dark:bg-violet-400" /></span><span className="font-mono text-xs tabular-nums" data-pin={name}>{((p.value / 1023) * 5).toFixed(2)} V</span></span>
                  ) : p.mode ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs" data-pin={name}><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.value ? colours[2] : 'transparent', border: `1px solid ${colours[2]}` }} aria-hidden />{p.value ? 'High' : 'Low'}</span>
                  ) : <span className="text-xs text-zinc-500 dark:text-zinc-400">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
