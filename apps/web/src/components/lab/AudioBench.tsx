'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Circle, Code2, Download, Mic, Play, Square, Trash2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { encodeWav, peakFrequency, rmsDb, thdPercent } from '@/lib/lab/audio';
import { shareFragment } from '@/lib/lab/share';
import { NumField, ui } from '@/components/sim/bench-ui';
import { keep } from './lab-files';

// Hyperion Signals → Audio (M473): test and measurement with the computer's own sound. The input is the microphone
// or a tone generator (sine, square, sawtooth, triangle, white noise); a scope (triggered on a rising zero crossing so
// a steady tone stands still) and a spectrum analyser draw it live; the level, the strongest frequency and its
// distortion are read off. Record saves the exact samples (an AudioWorklet tap, public/hyperion/pcm-tap.js) as a WAV in
// Hyperion's files; the data logger writes a reading at each interval to a table, saved as CSV. Nothing leaves the
// computer. Drawing runs only while the input is on.

type Input = 'mic' | 'gen';
type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
interface Reading { t: number; level: number; hz: number; peak: number; thd: number }
const FFT = 8192;
const fmtHz = (v: number) => (!Number.isFinite(v) ? '–' : v >= 1000 ? `${(v / 1000).toFixed(3)} kHz` : `${v.toFixed(1)} Hz`);
/** Milliseconds and white noise, outside the component (the hooks' rules keep impure calls out of its body). */
const clock = () => performance.now();
const fillNoise = (d: Float32Array) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; };
const stamp = () => new Date().toTimeString().slice(0, 8).replace(/:/g, '');

interface Live { ctx: AudioContext; analyser: AnalyserNode; gain: GainNode; speak: GainNode; osc?: OscillatorNode; noise?: AudioBufferSourceNode; stream?: MediaStream; tap?: AudioWorkletNode }

export function AudioBench() {
  const dark = useDarkMode(), router = useRouter();
  const [input, setInput] = useState<Input>('gen');
  const [wave, setWave] = useState<Wave>('sine');
  const [freq, setFreq] = useState(1000);
  const [levelDb, setLevelDb] = useState(-12);
  const [speakers, setSpeakers] = useState(false);
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState<Reading | null>(null);
  const [logEvery, setLogEvery] = useState(0.5);
  const [logging, setLogging] = useState(false);
  const [rows, setRows] = useState<Reading[]>([]);
  const [recSecs, setRecSecs] = useState(3);
  const [recording, setRecording] = useState(0);
  const [saved, setSaved] = useState<{ name: string; url: string; secs: number; fs: number } | null>(null);
  const live = useRef<Live | null>(null);
  const scope = useRef<HTMLCanvasElement>(null), spectrum = useRef<HTMLCanvasElement>(null);
  const rec = useRef<{ want: number; chunks: Float32Array[]; got: number } | null>(null);
  const started = useRef(0), lastLog = useRef(0);
  const [rate, setRate] = useState(0);
  const logRef = useRef({ logging, every: logEvery }), darkRef = useRef(dark);
  useEffect(() => { logRef.current = { logging, every: logEvery }; darkRef.current = dark; }, [logging, logEvery, dark]);

  // The generator's settings follow the controls while it plays.
  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.gain.gain.setTargetAtTime(10 ** (levelDb / 20), l.ctx.currentTime, 0.01);
    if (l.osc) { l.osc.frequency.setTargetAtTime(freq, l.ctx.currentTime, 0.01); if (wave !== 'noise') l.osc.type = wave; }
    l.speak.gain.setTargetAtTime(speakers && input === 'gen' ? 1 : 0, l.ctx.currentTime, 0.01);
  }, [freq, levelDb, wave, speakers, input]);

  const stop = () => {
    const l = live.current;
    live.current = null;
    if (!l) return;
    l.stream?.getTracks().forEach((t) => t.stop());
    void l.ctx.close();
    setOn(false);
    rec.current = null; setRecording(0);
  };
  // Closing the window (or leaving the tab) lets the microphone go.
  useEffect(() => () => { const l = live.current; live.current = null; l?.stream?.getTracks().forEach((t) => t.stop()); void l?.ctx.close(); }, []);

  const start = async () => {
    setError('');
    try {
      const ctx = new AudioContext(), analyser = ctx.createAnalyser(), gain = ctx.createGain(), speak = ctx.createGain();
      analyser.fftSize = FFT; analyser.smoothingTimeConstant = 0.5; analyser.minDecibels = -140; analyser.maxDecibels = 0;
      speak.gain.value = speakers && input === 'gen' ? 1 : 0;
      const l: Live = { ctx, analyser, gain, speak };
      if (input === 'mic') {
        // The browser's own clean-ups would change what is measured: turn them off.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        l.stream = stream; ctx.createMediaStreamSource(stream).connect(gain); gain.gain.value = 1;
      } else {
        gain.gain.value = 10 ** (levelDb / 20);
        if (wave === 'noise') {
          const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
          fillNoise(d);
          const src = ctx.createBufferSource(); src.buffer = b; src.loop = true; src.connect(gain); src.start(); l.noise = src;
        } else {
          const osc = ctx.createOscillator(); osc.type = wave; osc.frequency.value = freq; osc.connect(gain); osc.start(); l.osc = osc;
        }
      }
      gain.connect(analyser); gain.connect(speak); speak.connect(ctx.destination);
      try {
        await ctx.audioWorklet.addModule('/hyperion/pcm-tap.js');
        const tap = new AudioWorkletNode(ctx, 'uv-pcm-tap'), mute = ctx.createGain(); mute.gain.value = 0;
        gain.connect(tap); tap.connect(mute); mute.connect(ctx.destination);
        tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
          const r = rec.current;
          if (!r) return;
          r.chunks.push(e.data); r.got += e.data.length;
          setRecording(Math.min(1, r.got / r.want));
          if (r.got >= r.want) { rec.current = null; void finish(r, ctx.sampleRate); }
        };
        l.tap = tap;
      } catch { /* recording unavailable; the meters still work */ }
      await ctx.resume();
      live.current = l; started.current = clock(); lastLog.current = 0; setRate(ctx.sampleRate);
      setOn(true);
      requestAnimationFrame(draw);
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'The microphone wasn’t allowed. Allow it in the browser’s address bar, or use the generator.' : `Sound couldn’t start: ${(e as Error).message}`);
      stop();
    }
  };

  const finish = async (r: { want: number; chunks: Float32Array[] }, fs: number) => {
    const all = new Float32Array(r.want);
    let at = 0;
    for (const c of r.chunks) { all.set(c.subarray(0, Math.min(c.length, r.want - at)), at); at += c.length; if (at >= r.want) break; }
    const bytes = encodeWav([all], fs, 24), name = `recording-${stamp()}.wav`;
    await keep(name, bytes);
    setSaved((old) => { if (old) URL.revokeObjectURL(old.url); return { name, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/wav' })), secs: r.want / fs, fs }; });
    setRecording(0);
  };
  const record = () => { const l = live.current; if (!l?.tap) return; rec.current = { want: Math.round(Math.min(60, Math.max(0.1, recSecs)) * l.ctx.sampleRate), chunks: [], got: 0 }; setRecording(0.001); };

  // The live picture: scope and spectrum on canvases sized to their boxes (sharp on any screen).
  const timeData = useRef(new Float32Array(FFT)), freqData = useRef(new Float32Array(FFT / 2));
  const lastShown = useRef(0);
  const draw = () => {
    const l = live.current;
    if (!l) return;
    const t = timeData.current, f = freqData.current, fs = l.ctx.sampleRate;
    l.analyser.getFloatTimeDomainData(t); l.analyser.getFloatFrequencyData(f);
    const colours = darkRef.current ? { line: '#a78bfa', grid: 'rgba(255,255,255,0.08)', text: '#a1a1aa' } : { line: '#7c3aed', grid: 'rgba(0,0,0,0.07)', text: '#71717a' };
    paintScope(scope.current, t, colours);
    paintSpectrum(spectrum.current, f, fs, colours);
    const pk = peakFrequency(f, fs, FFT), reading: Reading = { t: (clock() - started.current) / 1000, level: rmsDb(t), hz: pk.hz, peak: pk.db, thd: thdPercent(Array.from(f, (d) => 10 ** (d / 10))) };
    const nowMs = clock();
    if (nowMs - lastShown.current > 200) { lastShown.current = nowMs; setNow(reading); }
    const lg = logRef.current;
    if (lg.logging && reading.t - lastLog.current >= lg.every) { lastLog.current = reading.t; setRows((r) => (r.length >= 100_000 ? r : [...r, reading])); }
    requestAnimationFrame(draw);
  };

  const csv = () => `time_s,level_dBFS,peak_Hz,peak_dB,thd_percent\n${rows.map((r) => [r.t.toFixed(3), r.level.toFixed(2), r.hz.toFixed(2), r.peak.toFixed(2), Number.isFinite(r.thd) ? r.thd.toFixed(3) : ''].join(',')).join('\n')}\n`;
  const downloadCsv = () => { const url = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'audio-log.csv'; a.click(); URL.revokeObjectURL(url); };
  const [logSaved, setLogSaved] = useState('');
  const saveLog = async () => { const name = `audio-log-${stamp()}.csv`; await keep(name, new TextEncoder().encode(csv())); setLogSaved(name); };
  const openInCode = async (name: string) => router.push(`/hyperion#${await shareFragment({
    name: 'measure.m', view: 'code',
    code: `% A recording from Signals → Audio (in Hyperion's files)\n[y, fs] = audioread('${name}');\nt = (0:numel(y)-1)/fs;\nsubplot(3, 1, 1); plot(t, y); xlabel('Time (s)'); title(sprintf('%s: %.1f s at %d Hz', '${name}', numel(y)/fs, fs))\nsubplot(3, 1, 2); pwelch(y, 4096, 2048, 4096, fs)\nsubplot(3, 1, 3); spectrogram(y, 1024, 768, 1024, fs)\nfprintf('Level %.1f dBFS, THD %.1f dB\\n', 10*log10(mean(y.^2)), thd(y, fs))\n% sound(y, fs)   % play it back\n`,
  })}`);
  const openLogInCode = async () => router.push(`/hyperion#${await shareFragment({
    name: 'audio_log.m', view: 'code',
    code: `% The data logger's readings (saved in Hyperion's files as ${logSaved})\nT = readtable('${logSaved}');\nsubplot(2, 1, 1); plot(T.time_s, T.level_dBFS); ylabel('Level (dBFS)'); grid on\nsubplot(2, 1, 2); plot(T.time_s, T.peak_Hz); ylabel('Strongest frequency (Hz)'); xlabel('Time (s)'); grid on\nsummary(T)\n`,
  })}`);

  const { label, small } = ui;
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[32rem] gap-3">
      <aside className="panel flex min-h-0 w-[19rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Audio input" data-no-motion>
        <div>
          <p className={label}>Input</p>
          <div className="mt-1"><Segmented<Input> label="Input" value={input} onChange={(v) => { stop(); setInput(v); }} segments={[{ value: 'gen', label: 'Generator' }, { value: 'mic', label: 'Microphone' }]} /></div>
        </div>
        {input === 'gen' ? (
          <div className="space-y-3">
            <label className={label}>Wave
              <select value={wave} onChange={(e) => { const v = e.target.value as Wave; if ((v === 'noise') !== (wave === 'noise')) stop(); setWave(v); }} className="input mt-1 w-full">
                <option value="sine">Sine</option><option value="square">Square</option><option value="sawtooth">Sawtooth</option><option value="triangle">Triangle</option><option value="noise">White noise</option>
              </select>
            </label>
            {wave !== 'noise' && (
              <label className={label}>Frequency <span className="font-mono font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{fmtHz(freq)}</span>
                <input type="range" min={0} max={1000} value={Math.round((1000 * Math.log10(freq / 20)) / 3)} onChange={(e) => setFreq(+(20 * 10 ** ((3 * Number(e.target.value)) / 1000)).toPrecision(4))} className="mt-1 w-full accent-violet-600" aria-valuetext={fmtHz(freq)} />
              </label>
            )}
            <label className={label}>Level <span className="font-mono font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{levelDb} dBFS</span>
              <input type="range" min={-60} max={0} value={levelDb} onChange={(e) => setLevelDb(Number(e.target.value))} className="mt-1 w-full accent-violet-600" aria-valuetext={`${levelDb} dBFS`} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200"><input type="checkbox" checked={speakers} onChange={(e) => setSpeakers(e.target.checked)} className="h-4 w-4 accent-violet-600" />Play it through the speakers</label>
          </div>
        ) : <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">The browser asks once to use the microphone. Its echo, noise and volume corrections are turned off, so you measure the real sound. Nothing is sent anywhere.</p>}
        <button type="button" className="btn-primary inline-flex items-center justify-center gap-1.5" onClick={() => (on ? stop() : void start())}>
          {on ? <><Square className="h-4 w-4" aria-hidden />Stop</> : <>{input === 'mic' ? <Mic className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}Start</>}
        </button>
        {error && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{error}</p>}
        <div className="mt-auto space-y-1 border-t border-zinc-200/80 pt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          <p>dBFS: decibels below the loudest sound the computer can hold (0). The spectrum uses a {FFT.toLocaleString()}-point analysis{rate ? ` at ${rate.toLocaleString()} Hz` : ''}.</p>
        </div>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 p-4" aria-label="Scope and spectrum" data-no-motion>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300" aria-live="off">
          <span>Level <b className="font-mono tabular-nums" data-reading="level">{now ? `${now.level.toFixed(1)} dBFS` : '–'}</b></span>
          <span>Strongest <b className="font-mono tabular-nums" data-reading="hz">{now ? fmtHz(now.hz) : '–'}</b> at <b className="font-mono tabular-nums">{now ? `${now.peak.toFixed(1)} dB` : '–'}</b></span>
          <span>Distortion (THD) <b className="font-mono tabular-nums">{now && Number.isFinite(now.thd) ? `${now.thd.toFixed(2)} %` : '–'}</b></span>
        </div>
        <div className="min-h-0 flex-1">
          <canvas ref={scope} className="h-full w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={on ? `Scope: the waveform, ${now ? now.level.toFixed(0) : ''} dBFS` : 'Scope: off'} />
        </div>
        <div className="min-h-0 flex-[1.4]">
          <canvas ref={spectrum} className="h-full w-full rounded-xl bg-zinc-50 dark:bg-white/[0.04]" role="img" aria-label={on ? `Spectrum analyser: strongest at ${now ? fmtHz(now.hz) : ''}` : 'Spectrum analyser: off'} />
        </div>
        {!on && <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Press Start to see the sound.</p>}
      </section>

      <aside className="panel flex min-h-0 w-[20rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Record and log" data-no-motion>
        <div className="space-y-2">
          <p className={label}>Record</p>
          <NumField label="Length" unit="seconds, up to 60" value={recSecs} min={0.1} onChange={(v) => setRecSecs(Math.min(60, Math.max(0.1, v)))} />
          <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} disabled={!on || recording > 0} onClick={record}><Circle className="h-3.5 w-3.5 fill-red-500 text-red-500" aria-hidden />{recording > 0 ? `Recording… ${Math.round(recording * 100)}%` : 'Record'}</button>
          {saved && (
            <div className="space-y-1.5 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-700 dark:bg-white/[0.04] dark:text-zinc-200">
              <p>Saved in Hyperion’s files as <span className="font-mono" translate="no">{saved.name}</span> ({saved.secs.toFixed(1)} s, {saved.fs.toLocaleString()} Hz, 24-bit).</p>
              <audio controls src={saved.url} className="w-full" aria-label="Play the recording" />
              <div className="flex flex-wrap gap-1">
                <a className={small} href={saved.url} download={saved.name}><Download className="h-3.5 w-3.5" aria-hidden />WAV</a>
                <button type="button" className={small} onClick={() => void openInCode(saved.name)}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
          <p className={label}>Data logger</p>
          <NumField label="A reading every" unit="seconds" value={logEvery} min={0.05} onChange={(v) => setLogEvery(Math.max(0.05, v))} />
          <div className="flex flex-wrap gap-1">
            <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} disabled={!on} aria-pressed={logging} onClick={() => setLogging((v) => !v)}>{logging ? 'Pause logging' : 'Start logging'}</button>
            <button type="button" className={small} disabled={!rows.length} onClick={() => { setRows([]); setLogSaved(''); }}><Trash2 className="h-3.5 w-3.5" aria-hidden />Clear</button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300"><b className="font-mono tabular-nums">{rows.length.toLocaleString()}</b> readings</p>
          {rows.length > 0 && (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-1 text-start font-medium">Time (s)</th><th className="py-1 text-end font-medium">Level (dBFS)</th><th className="py-1 text-end font-medium">Strongest</th></tr></thead>
              <tbody>{rows.slice(-8).reverse().map((r) => <tr key={r.t} className="border-t border-zinc-100 dark:border-white/[0.06]"><td className="py-1 font-mono">{r.t.toFixed(2)}</td><td className="py-1 text-end font-mono">{r.level.toFixed(1)}</td><td className="py-1 text-end font-mono">{fmtHz(r.hz)}</td></tr>)}</tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-1">
            <button type="button" className={small} disabled={!rows.length} onClick={downloadCsv}><Download className="h-3.5 w-3.5" aria-hidden />CSV</button>
            <button type="button" className={small} disabled={!rows.length} onClick={() => void saveLog()}>Save to Hyperion’s files</button>
            {logSaved && <button type="button" className={small} onClick={() => void openLogInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>}
          </div>
          {logSaved && <p className="text-xs text-zinc-500 dark:text-zinc-400">Saved as <span className="font-mono" translate="no">{logSaved}</span>.</p>}
        </div>
      </aside>
    </div>
  );
}

type Colours = { line: string; grid: string; text: string };
/** Sizes a canvas to its box at the screen's pixel density; returns its context and size in CSS pixels. */
function fit(c: HTMLCanvasElement | null) {
  if (!c) return null;
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
function paintScope(c: HTMLCanvasElement | null, t: Float32Array, col: Colours) {
  const s = fit(c);
  if (!s) return;
  const { g, w, h } = s, span = Math.min(t.length / 2, 2048);
  // Trigger: the first rising zero crossing in the first half, so a steady wave holds still.
  let at = 0;
  for (let i = 1; i < t.length - span; i++) if (t[i - 1] < 0 && t[i] >= 0) { at = i; break; }
  g.strokeStyle = col.grid; g.lineWidth = 1;
  for (const y of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, y * h); g.lineTo(w, y * h); g.stroke(); }
  g.strokeStyle = col.line; g.lineWidth = 1.5; g.beginPath();
  for (let i = 0; i < span; i++) { const x = (i / (span - 1)) * w, y = h / 2 - t[at + i] * (h / 2) * 0.95; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = col.text; g.font = '11px Inter, system-ui, sans-serif'; g.fillText('+1', 6, 13); g.fillText('−1', 6, h - 5);
}
function paintSpectrum(c: HTMLCanvasElement | null, f: Float32Array, fs: number, col: Colours) {
  const s = fit(c);
  if (!s) return;
  const { g, w, h } = s, lo = Math.log10(20), hi = Math.log10(fs / 2), X = (hz: number) => ((Math.log10(hz) - lo) / (hi - lo)) * w, Y = (db: number) => (-db / 140) * h;
  g.strokeStyle = col.grid; g.lineWidth = 1; g.fillStyle = col.text; g.font = '11px Inter, system-ui, sans-serif';
  for (const hz of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) if (hz < fs / 2) { g.beginPath(); g.moveTo(X(hz), 0); g.lineTo(X(hz), h); g.stroke(); g.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, X(hz) + 3, h - 5); }
  for (const db of [-20, -40, -60, -80, -100, -120]) { g.beginPath(); g.moveTo(0, Y(db)); g.lineTo(w, Y(db)); g.stroke(); g.fillText(`${db} dB`, 6, Y(db) - 3); }
  g.strokeStyle = col.line; g.lineWidth = 1.5; g.beginPath();
  let first = true;
  for (let k = 1; k < f.length; k++) { const hz = (k * fs) / FFT; if (hz < 20) continue; const x = X(hz), y = Y(Math.max(-140, f[k])); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); }
  g.stroke();
}
