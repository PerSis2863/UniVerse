'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Check, Code2, Copy, Cpu, Download, KeyRound, Plus, Radio, Trash2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { useLiveInterval } from '@/lib/realtime-client';
import { useDarkMode } from '@/lib/use-dark';
import { cn } from '@/lib/utils';
import { shareFragment } from '@/lib/lab/share';
import { ui } from '@/components/sim/bench-ui';
import { keep } from './lab-files';
import { IotAlerts } from './IotAlerts';

// Hyperion Signals → IoT (M475): channels that devices send readings to (src/server/iot.ts). Make a channel with up
// to 8 fields, copy its write key into the device's code (curl, an ESP32 sketch or Python, filled in for you), and
// watch a chart per field update live. The write key is shown once (only its hash is kept); New key replaces it. A
// simulated device in this window sends made-up readings through the same public address, to try it without hardware.

interface Channel { id: string; name: string; description: string | null; fields: string[]; keyHint: string; entries: number; lastEntryAt: string | null }
interface Entries { channel: Channel; entries: { id: number; at: string; values: (number | null)[] }[] }
type Snippet = 'curl' | 'esp32' | 'python';
const LIGHT = ['#7c3aed', '#ea580c', '#16a34a', '#2563eb', '#dc2626', '#0891b2', '#ca8a04', '#db2777'], DARK = ['#a78bfa', '#fb923c', '#4ade80', '#60a5fa', '#f87171', '#22d3ee', '#facc15', '#f472b6'];
const ago = (iso: string | null, now: number) => { if (!iso) return 'never'; const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const clock = () => Date.now();

function snippet(kind: Snippet, url: string, key: string, fields: string[]) {
  const vals = fields.map((_, i) => `field${i + 1}`);
  if (kind === 'curl') return `curl -X POST ${url}/${key} \\\n  -H 'Content-Type: application/json' \\\n  -d '{${vals.map((v, i) => `"${v}": ${(20 + i * 10).toFixed(1)}`).join(', ')}}'\n\n# Or, from a board that can only open an address:\n# ${url}/${key}?${vals.map((v, i) => `${v}=${20 + i * 10}`).join('&')}`;
  if (kind === 'python') return `import requests, time\n\nURL = "${url}/${key}"\nwhile True:\n    reading = {${vals.map((v, i) => `"${v}": ${20 + i * 10}`).join(', ')}}   # your sensor's numbers\n    print(requests.post(URL, json=reading, timeout=10).json())\n    time.sleep(15)`;
  return `// ESP32 (Arduino IDE): Wi-Fi, then one reading every 15 seconds\n#include <WiFi.h>\n#include <HTTPClient.h>\n\nconst char* WIFI = "your-network";\nconst char* PASS = "your-password";\nconst char* URL  = "${url}/${key}";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(WIFI, PASS);\n  while (WiFi.status() != WL_CONNECTED) delay(500);\n}\n\nvoid loop() {\n${fields.map((f, i) => `  float v${i + 1} = analogRead(${32 + i}) * 3.3 / 4095;   // ${f}`).join('\n')}\n  HTTPClient http;\n  http.begin(URL);\n  http.addHeader("Content-Type", "application/json");\n  String body = String("{")${fields.map((_, i) => ` + "${i ? ',' : ''}\\"field${i + 1}\\":" + String(v${i + 1})`).join('')} + "}";\n  Serial.println(http.POST(body));\n  http.end();\n  delay(15000);\n}`;
}

export function IotBench() {
  const dark = useDarkMode(), router = useRouter(), colours = dark ? DARK : LIGHT;
  const live = useLiveInterval(20_000, 0);
  const { data, mutate } = useSWR<{ channels: Channel[]; max: number }>('/iot/channels', fetcher, { refreshInterval: live });
  const [chosen, setChosen] = useState<string | null>(null);
  const channel = data?.channels.find((c) => c.id === chosen) ?? data?.channels[0] ?? null;
  const { data: entries, mutate: reload } = useSWR<Entries>(channel ? `/iot/channels/${channel.id}/entries?limit=500` : null, fetcher, { refreshInterval: live });
  const [name, setName] = useState('');
  const [fields, setFields] = useState('Temperature, Humidity');
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<Snippet>('curl');
  const [copied, setCopied] = useState(false);
  const [sim, setSim] = useState(false);
  const [now, setNow] = useState(clock);
  useEffect(() => { const t = setInterval(() => setNow(clock()), 5000); return () => clearInterval(t); }, []);
  const url = typeof window === 'undefined' ? '/api/core/iot/write' : `${window.location.origin}/api/core/iot/write`;
  const key = channel ? keys[channel.id] : undefined;

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ channel: Channel; writeKey: string }>('/iot/channels', { name: name.trim(), fields: fields.split(',').map((f) => f.trim()).filter(Boolean) });
      setKeys((k) => ({ ...k, [r.data.channel.id]: r.data.writeKey })); setChosen(r.data.channel.id); setName(''); void mutate();
    } catch (e) { toast.error(errorMessage(e, 'The channel couldn’t be made.')); } finally { setBusy(false); }
  };
  const renew = async () => {
    if (!channel) return;
    try { const r = await api.post<{ writeKey: string }>(`/iot/channels/${channel.id}/key`); setKeys((k) => ({ ...k, [channel.id]: r.data.writeKey })); void mutate(); return r.data.writeKey; } catch (e) { toast.error(errorMessage(e, 'No new key.')); return null; }
  };
  const remove = async () => {
    if (!channel || !window.confirm(`Delete “${channel.name}” and its ${channel.entries.toLocaleString()} readings?`)) return;
    try { await api.delete(`/iot/channels/${channel.id}`); setSim(false); setChosen(null); void mutate(); } catch (e) { toast.error(errorMessage(e, 'It couldn’t be deleted.')); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ } };

  // The simulated device: a made-up reading every 2 seconds through the public address, like a real board.
  const simRef = useRef({ t: 0 });
  useEffect(() => {
    if (!sim || !channel || !key) return;
    const n = channel.fields.length, target = `${url}/${key}`;
    const tick = () => {
      const t = (simRef.current.t += 2);
      const body = Object.fromEntries(Array.from({ length: n }, (_, i) => [`field${i + 1}`, +(20 + 10 * i + 4 * Math.sin(t / (20 + 7 * i)) + (Math.random() - 0.5)).toFixed(2)]));
      void fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(() => { void reload(); }).catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [sim, channel, key, url, reload]);
  const startSim = async () => { if (!key && !(await renew())) return; setSim(true); };

  const rows = useMemo(() => entries?.entries ?? [], [entries]);
  const csv = () => channel ? `time,${channel.fields.map((f) => f.replace(/[^\w]+/g, '_')).join(',')}\n${rows.map((r) => [new Date(r.at).toISOString(), ...r.values.map((v) => v ?? '')].join(',')).join('\n')}\n` : '';
  const downloadCsv = () => { const u = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' })); const a = document.createElement('a'); a.href = u; a.download = `${channel?.name ?? 'channel'}.csv`; a.click(); URL.revokeObjectURL(u); };
  const openInCode = async () => {
    if (!channel) return;
    const file = `iot-${channel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    await keep(file, new TextEncoder().encode(csv()));
    const cols = channel.fields.map((f) => f.replace(/[^\w]+/g, '_'));
    router.push(`/hyperion#${await shareFragment({ name: 'iot_channel.m', view: 'code', code: `% ${channel.name}: its last ${rows.length} readings, saved in Hyperion's files as ${file}\nT = readtable('${file}');\nn = height(T);\n${cols.map((c, i) => `subplot(${cols.length}, 1, ${i + 1}); plot(1:n, T.${c}); ylabel('${channel.fields[i].replace(/'/g, "''")}'); grid on`).join('\n')}\nxlabel('Reading')\nsummary(T)\n` })}`);
  };

  const { label, small } = ui;
  return (
    <div className="flex h-[calc(100dvh-12rem+var(--bare-gain,0px))] min-h-[32rem] gap-3">
      <aside className="panel flex min-h-0 w-[18rem] shrink-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Channels" data-no-motion>
        <div>
          <p className={label}>Your channels <span className="font-normal text-zinc-500 dark:text-zinc-400">({data?.channels.length ?? 0} of {data?.max ?? 10})</span></p>
          <ul className="mt-1 space-y-1">
            {data?.channels.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setChosen(c.id)} aria-pressed={c.id === channel?.id} className={cn(ui.item, c.id === channel?.id && ui.on)}>
                  <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate" translate="no">{c.name}</span><span className="text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">{c.entries.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
          {data && !data.channels.length && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">None yet: make one below.</p>}
        </div>
        <form className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-white/10" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <p className={label}>New channel</p>
          <label className={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Greenhouse" className="input mt-1 w-full" /></label>
          <label className={label}>Fields <span className="font-normal text-zinc-500 dark:text-zinc-400">(up to 8, with commas)</span><input value={fields} onChange={(e) => setFields(e.target.value)} className="input mt-1 w-full" /></label>
          <button type="submit" className="btn-primary inline-flex w-full items-center justify-center gap-1.5" disabled={busy || !name.trim() || !fields.trim()}><Plus className="h-4 w-4" aria-hidden />Make the channel</button>
        </form>
        <p className="mt-auto text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">A device sends at most one reading a second; each channel keeps its newest 20,000. Only you see your channels.</p>
      </aside>

      <section className="panel flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-label="Dashboard" data-no-motion>
        {!channel ? <div className="grid h-full place-items-center text-sm text-zinc-500 dark:text-zinc-400">Make a channel to see its dashboard.</div> : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white" translate="no">{channel.name}</h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{(entries?.channel ?? channel).entries.toLocaleString()} readings · last {ago((entries?.channel ?? channel).lastEntryAt, now)}</span>
              {sim && <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-950 dark:bg-violet-500/20 dark:text-white">Simulated device sending</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {channel.fields.map((f, i) => {
                const pts = rows.map((r) => ({ t: new Date(r.at).getTime(), v: r.values[i] })).filter((p): p is { t: number; v: number } => typeof p.v === 'number');
                return <FieldChart key={f} name={f} pts={pts} colour={colours[i % colours.length]} />;
              })}
            </div>
            {!rows.length && <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">No readings yet: send one with the code on the right, or start the simulated device.</p>}
            <IotAlerts key={channel.id} channelId={channel.id} fields={channel.fields} />
          </>
        )}
      </section>

      <aside className="panel flex min-h-0 w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto p-4" aria-label="Write key and device code" data-no-motion>
        {channel && (
          <>
            <div className="space-y-1.5">
              <p className={label}>Write key</p>
              {key ? (
                <>
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 font-mono text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" translate="no" data-write-key>{key}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">Copy it now: it isn’t shown again. Anyone with it can send readings to this channel (not read them).</p>
                </>
              ) : <p className="text-xs text-zinc-600 dark:text-zinc-300">Starts with <span className="font-mono" translate="no">{channel.keyHint}…</span>; shown only when made. Lost it? Make a new one (the old one stops working).</p>}
              <div className="flex flex-wrap gap-1">
                {key && <button type="button" className={small} onClick={() => void copy(key)}>{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}Copy</button>}
                <button type="button" className={small} onClick={() => void renew()}><KeyRound className="h-3.5 w-3.5" aria-hidden />New key</button>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
              <p className={label}>The device’s code</p>
              <Segmented<Snippet> label="Code for" value={kind} onChange={setKind} segments={[{ value: 'curl', label: 'curl' }, { value: 'esp32', label: 'ESP32' }, { value: 'python', label: 'Python' }]} />
              <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-50 p-2 font-mono text-[11px] leading-relaxed text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-100" translate="no" tabIndex={0} aria-label="The device’s code">{snippet(kind, url, key ?? 'YOUR_WRITE_KEY', channel.fields)}</pre>
              <button type="button" className={small} onClick={() => void copy(snippet(kind, url, key ?? 'YOUR_WRITE_KEY', channel.fields))}><Copy className="h-3.5 w-3.5" aria-hidden />Copy the code</button>
            </div>
            <div className="space-y-1.5 border-t border-zinc-200/80 pt-3 dark:border-white/10">
              <p className={label}>No device yet?</p>
              <button type="button" className={cn(small, 'border border-zinc-200 dark:border-white/15')} aria-pressed={sim} onClick={() => (sim ? setSim(false) : void startSim())}><Cpu className="h-3.5 w-3.5" aria-hidden />{sim ? 'Stop the simulated device' : 'Start a simulated device'}</button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">It sends made-up readings every 2 seconds through the same address a real device uses{key ? '' : ' (it makes a new key first)'}.</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-1 border-t border-zinc-200/80 pt-3 dark:border-white/10">
              <button type="button" className={small} disabled={!rows.length} onClick={downloadCsv}><Download className="h-3.5 w-3.5" aria-hidden />CSV</button>
              <button type="button" className={small} disabled={!rows.length} onClick={() => void openInCode()}><Code2 className="h-3.5 w-3.5" aria-hidden />Open in Code</button>
              <button type="button" className={cn(small, 'text-red-700 dark:text-red-300')} onClick={() => void remove()}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function FieldChart({ name, pts, colour }: { name: string; pts: { t: number; v: number }[]; colour: string }) {
  const last = pts[pts.length - 1];
  const vs = pts.map((p) => p.v), lo0 = vs.length ? Math.min(...vs) : 0, hi0 = vs.length ? Math.max(...vs) : 1, pad = (hi0 - lo0) * 0.08 || 1, lo = lo0 - pad, hi = hi0 + pad;
  const t0 = pts[0]?.t ?? 0, t1 = last?.t ?? 1;
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * 1000, Y = (v: number) => (1 - (v - lo) / (hi - lo)) * 300;
  return (
    <div className="rounded-xl border border-zinc-200/80 p-3 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-2"><p className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300" translate="no">{name}</p><p className="font-mono text-lg tabular-nums text-zinc-900 dark:text-white" data-field={name}>{last ? +last.v.toPrecision(5) : '–'}</p></div>
      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="mt-1 h-28 w-full" role="img" aria-label={`${name}: ${pts.length} readings${last ? `, latest ${+last.v.toPrecision(5)}` : ''}`}>
        {pts.length > 1 && <path d={pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')} fill="none" stroke={colour} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400"><span>{pts.length ? +lo0.toPrecision(4) : ''} – {pts.length ? +hi0.toPrecision(4) : ''}</span><span>{pts.length ? new Date(t1).toLocaleTimeString() : ''}</span></div>
    </div>
  );
}
