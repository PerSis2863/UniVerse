'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { convertBase, cron, escapeHtml, MOCK_FIELDS, mockRows, nameStyles, unescapeHtml, type MockField } from '@/lib/more-tools';
import { tableAs } from '@/lib/quick-tools';
import { cn } from '@/lib/utils';
import { Btn, CopyBtn, Field, Out, area, save } from './QuickTools';
import { useKept } from './kept';
import { Segments } from './bits';

// Collaborate → Create → Code, fourth set (M74): number bases, name styles, a shadow maker, a cron
// reader, HTML escaping, hidden characters, web status codes, a key tester and sample data. All on
// this device.

export type DevId = 'base' | 'names' | 'shadow' | 'cron' | 'escape' | 'chars' | 'status' | 'keys' | 'mock';

export function DevTool({ id }: { id: DevId }) {
  const T = { base: Base, names: Names, shadow: Shadow, cron: Cron, escape: Escape, chars: Chars, status: Status, keys: Keys, mock: Mock }[id];
  return <T />;
}

const BASES = [[2, 'Binary'], [8, 'Octal'], [10, 'Decimal'], [16, 'Hex'], [36, 'Base 36']] as const;
/** Number bases: binary, octal, decimal, hex at once; text as bytes too. */
function Base() {
  const [v, setV] = useState('255'), [from, setFrom] = useState(10), [text, setText] = useState('Hi!');
  const out = (() => { try { return { rows: BASES.map(([b, l]) => [l, convertBase(v, from, b)] as const) }; } catch (e) { return { err: (e as Error).message, rows: [] }; } })();
  const err = out.err ?? '';
  const bytes = [...new TextEncoder().encode(text)];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Number"><input className="input w-64 font-mono" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label="Written in"><select className="input w-auto!" value={from} onChange={(e) => setFrom(+e.target.value)}>{BASES.map(([b, l]) => <option key={b} value={b}>{l}</option>)}</select></Field>
      </div>
      {err ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{err}</p> : (
        <ul className="divide-y divide-zinc-200 dark:divide-white/10 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10">{out.rows.map(([l, x]) => <li key={l} className="flex items-center gap-3 px-3 py-2"><span className="w-20 text-xs text-zinc-600 dark:text-zinc-300">{l}</span><span className="flex-1 min-w-0 break-all font-mono text-zinc-900 dark:text-white">{x}</span><CopyBtn text={x} /></li>)}</ul>
      )}
      <Field label="Text as bytes (UTF-8)"><input className="input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <div className="grid gap-2 sm:grid-cols-2 font-mono text-xs text-zinc-900 dark:text-white">
        <p className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] p-3 break-all">{bytes.map((b) => b.toString(2).padStart(8, '0')).join(' ')}</p>
        <p className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] p-3 break-all">{bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}</p>
      </div>
    </div>
  );
}

/** Name styles: one name as camelCase, snake_case, kebab-case and the rest. */
function Names() {
  const [t, setT] = useState('user profile photo');
  const s = nameStyles(t);
  return (
    <div className="space-y-3">
      <Field label="Words or a name"><input className="input" value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <ul className="divide-y divide-zinc-200 dark:divide-white/10 rounded-2xl ring-1 ring-zinc-200 dark:ring-white/10">{Object.entries(s).map(([k, v]) => <li key={k} className="flex items-center gap-3 px-3 py-2"><span className="w-32 text-xs text-zinc-600 dark:text-zinc-300">{k}</span><span className="flex-1 min-w-0 break-all font-mono text-zinc-900 dark:text-white">{v}</span><CopyBtn text={v} /></li>)}</ul>
    </div>
  );
}

/** Shadow maker: a CSS box shadow and rounded corners, seen live. */
function Shadow() {
  const [s, setS] = useKept('uv-shadow', { x: 0, y: 12, blur: 32, spread: -8, colour: '#171f44', alpha: 35, radius: 24, inset: false, soft: true, bg: '#ffffff' });
  const rgba = (h: string, a: number) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a / 100})`; };
  const main = `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${rgba(s.colour, s.alpha)}`;
  const css = `box-shadow: ${s.soft && !s.inset ? `0 1px 2px ${rgba(s.colour, Math.round(s.alpha / 3))}, ` : ''}${main};\nborder-radius: ${s.radius}px;`;
  const num = (k: 'x' | 'y' | 'blur' | 'spread' | 'alpha' | 'radius', l: string, min: number, max: number) => <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200"><span className="w-20">{l}</span><input type="range" min={min} max={max} value={s[k]} onChange={(e) => setS({ ...s, [k]: +e.target.value })} className="flex-1 accent-pink-500" /><span className="w-10 text-end font-mono tabular-nums">{s[k]}</span></label>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        {num('x', 'Across', -50, 50)}{num('y', 'Down', -50, 50)}{num('blur', 'Blur', 0, 100)}{num('spread', 'Spread', -50, 50)}{num('alpha', 'Strength %', 0, 100)}{num('radius', 'Corners', 0, 80)}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Shadow colour"><input type="color" className="input h-10 p-1 w-20" value={s.colour} onChange={(e) => setS({ ...s, colour: e.target.value })} /></Field>
          <Field label="Box colour"><input type="color" className="input h-10 p-1 w-20" value={s.bg} onChange={(e) => setS({ ...s, bg: e.target.value })} /></Field>
          <Btn on={s.inset} onClick={() => setS({ ...s, inset: !s.inset })}>Inside</Btn>
          <Btn on={s.soft} onClick={() => setS({ ...s, soft: !s.soft })}>Extra soft layer</Btn>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid place-items-center rounded-2xl bg-zinc-100 p-12" style={{ backgroundImage: 'radial-gradient(rgb(0 0 0 / 0.06) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
          <div className="w-40 h-28" style={{ background: s.bg, borderRadius: s.radius, boxShadow: css.match(/box-shadow: (.*);/)![1] }} role="img" aria-label="Preview" />
        </div>
        <pre className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 whitespace-pre-wrap">{css}</pre>
        <CopyBtn text={css} label="Copy the CSS" />
      </div>
    </div>
  );
}

const PRESETS: [string, string][] = [['Every 15 minutes', '*/15 * * * *'], ['Every day at 9:30', '30 9 * * *'], ['Weekdays at 8:00', '0 8 * * 1-5'], ['Every Monday at noon', '0 12 * * MON'], ['First of the month at midnight', '0 0 1 * *']];
/** Cron reader: what a schedule means, in words, and when it runs next. */
function Cron() {
  const [e, setE] = useState('30 9 * * 1-5');
  const r = useMemo(() => { try { return cron(e, new Date()); } catch (x) { return { err: (x as Error).message }; } }, [e]);
  return (
    <div className="space-y-3">
      <Field label="Schedule (minute hour day month weekday)"><input className={cn('input font-mono text-lg', 'err' in r && 'ring-2 ring-rose-500')} value={e} onChange={(x) => setE(x.target.value)} aria-invalid={'err' in r} /></Field>
      <div className="flex flex-wrap gap-1.5">{PRESETS.map(([l, v]) => <Btn key={v} on={e === v} onClick={() => setE(v)}>{l}</Btn>)}</div>
      {'err' in r ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{r.err}</p> : (
        <>
          <p className="text-xl font-bold text-zinc-900 dark:text-white" role="status">{r.words} <span className="text-sm font-normal text-zinc-600 dark:text-zinc-300">(UTC)</span></p>
          <ol className="space-y-1 text-sm" aria-label="Next runs">{r.next.map((d) => <li key={+d} className="font-mono tabular-nums text-zinc-900 dark:text-white">{d.toISOString().replace('T', ' ').slice(0, 16)} UTC <span className="font-sans text-zinc-600 dark:text-zinc-300">· {d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} your time</span></li>)}</ol>
        </>
      )}
    </div>
  );
}

/** HTML escape: make text safe to show in a web page, or turn entities back into text. */
function Escape() {
  const [t, setT] = useKept('uv-draft-escape', '<p class="note">Tom & Jo’s “café”</p>');
  return (
    <div className="space-y-3">
      <Field label="Text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2"><Btn onClick={() => setT(escapeHtml(t))}>Escape (&lt; → &amp;lt;)</Btn><Btn onClick={() => setT(unescapeHtml(t))}>Unescape (&amp;lt; → &lt;)</Btn></div>
      <Out text={t} />
    </div>
  );
}

const INVISIBLE: Record<number, string> = { 0x200b: 'zero-width space', 0x200c: 'zero-width non-joiner', 0x200d: 'zero-width joiner', 0xfeff: 'byte-order mark', 0xa0: 'no-break space', 0x2060: 'word joiner', 0x00ad: 'soft hyphen', 0x202e: 'right-to-left override', 0x09: 'tab' };
/** Hidden characters: every character's code, and the invisible ones that break code and searches. */
function Chars() {
  const [t, setT] = useState('Hello​ world — café');
  const chars = [...t].slice(0, 400);
  const hidden = chars.filter((c) => INVISIBLE[c.codePointAt(0)!]);
  return (
    <div className="space-y-3">
      <Field label="Paste text"><textarea className={area} value={t} onChange={(e) => setT(e.target.value)} /></Field>
      <p className={cn('text-sm font-semibold', hidden.length ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-300')} role="status">{hidden.length ? `${hidden.length} hidden character${hidden.length > 1 ? 's' : ''}: ${[...new Set(hidden.map((c) => INVISIBLE[c.codePointAt(0)!]))].join(', ')}` : 'No hidden characters.'}</p>
      {hidden.length > 0 && <Btn onClick={() => setT([...t].map((c) => { const n = c.codePointAt(0)!; return n === 0xa0 ? ' ' : INVISIBLE[n] && n !== 0x09 ? '' : c; }).join(''))}>Remove them</Btn>}
      <div className="flex flex-wrap gap-1.5" aria-label="Characters">
        {chars.map((c, k) => { const n = c.codePointAt(0)!, bad = !!INVISIBLE[n]; return (
          <span key={k} className={cn('rounded-lg px-2 py-1 text-center ring-1', bad ? 'bg-amber-100 ring-amber-400 dark:bg-amber-400/20' : 'ring-zinc-200 dark:ring-white/10')} title={INVISIBLE[n]}>
            <span className="block text-lg text-zinc-900 dark:text-white min-h-7">{bad || c === ' ' ? '·' : c}</span>
            <span className="block font-mono text-[11px] text-zinc-600 dark:text-zinc-300">U+{n.toString(16).toUpperCase().padStart(4, '0')}</span>
          </span>
        ); })}
      </div>
    </div>
  );
}

const CODES: [number, string, string][] = [
  [100, 'Continue', 'Go on, send the rest.'], [101, 'Switching protocols', 'Changing to another protocol, such as WebSocket.'],
  [200, 'OK', 'It worked.'], [201, 'Created', 'It worked and something new was made.'], [202, 'Accepted', 'Received; it will be done later.'], [204, 'No content', 'It worked; there is nothing to send back.'], [206, 'Partial content', 'Here is the part you asked for (videos, downloads).'],
  [301, 'Moved permanently', 'It lives at a new address for good.'], [302, 'Found', 'It is at another address for now.'], [304, 'Not modified', 'Use the copy you already have.'], [307, 'Temporary redirect', 'Try that other address this time, the same way.'], [308, 'Permanent redirect', 'Always use that other address, the same way.'],
  [400, 'Bad request', 'The request is malformed.'], [401, 'Unauthorised', 'Sign in first.'], [403, 'Forbidden', 'Signed in, but not allowed.'], [404, 'Not found', 'Nothing lives at this address.'], [405, 'Method not allowed', 'This address doesn’t take that kind of request.'], [408, 'Request timeout', 'The request took too long to arrive.'], [409, 'Conflict', 'It clashes with the current state (someone changed it).'], [410, 'Gone', 'It was here, and it’s been removed for good.'], [413, 'Content too large', 'What was sent is too big.'], [415, 'Unsupported media type', 'That kind of file isn’t accepted.'], [418, 'I’m a teapot', 'A joke from 1998; some servers still say it.'], [422, 'Unprocessable content', 'Understood, but the details don’t make sense.'], [429, 'Too many requests', 'Slow down and try again later.'],
  [500, 'Internal server error', 'Something broke on the server.'], [501, 'Not implemented', 'The server can’t do that yet.'], [502, 'Bad gateway', 'A server in the middle got a bad answer.'], [503, 'Service unavailable', 'Down or too busy; try again soon.'], [504, 'Gateway timeout', 'A server in the middle waited too long.'],
];
/** Web status codes: what 404, 503 and the rest mean, in plain words. */
function Status() {
  const [q, setQ] = useState('');
  const shown = CODES.filter(([c, n, d]) => `${c} ${n} ${d}`.toLowerCase().includes(q.toLowerCase()));
  const tone = (c: number) => (c < 200 ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200' : c < 300 ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : c < 400 ? 'bg-indigo-500/15 text-indigo-800 dark:text-aqua-200' : c < 500 ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200' : 'bg-rose-500/15 text-rose-800 dark:text-rose-200');
  return (
    <div className="space-y-3">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a code or a word: 404, timeout…" aria-label="Find a status code" />
      <ul className="divide-y divide-zinc-200 dark:divide-white/10">{shown.map(([c, n, d]) => <li key={c} className="flex items-start gap-3 py-2"><span className={cn('rounded-lg px-2 py-0.5 font-mono font-bold', tone(c))}>{c}</span><span className="min-w-0"><span className="block font-semibold text-zinc-900 dark:text-white">{n}</span><span className="block text-sm text-zinc-600 dark:text-zinc-300">{d}</span></span></li>)}</ul>
    </div>
  );
}

/** Key tester: what the browser hears for each key (for shortcuts, games and broken keyboards). */
function Keys() {
  const [k, setK] = useState<KeyboardEvent | null>(null), [hist, setHist] = useState<string[]>([]);
  const mods = k ? ['Ctrl', 'Alt', 'Shift', 'Meta'].filter((m) => k.getModifierState(m === 'Ctrl' ? 'Control' : m)) : [];
  return (
    <div className="space-y-3">
      <div tabIndex={0} role="textbox" aria-label="Press any key here" aria-readonly="true"
        onKeyDown={(e) => { if (e.key !== 'Tab') e.preventDefault(); setK(e.nativeEvent); setHist((h) => [e.key === ' ' ? 'Space' : e.key, ...h].slice(0, 16)); }}
        className="grid place-items-center rounded-3xl border-2 border-dashed border-zinc-300 dark:border-white/15 p-8 text-center outline-none focus:border-pink-500 focus:bg-pink-500/5 transition-colors cursor-text">
        {k ? <p className="text-6xl font-bold font-mono text-zinc-900 dark:text-white">{k.key === ' ' ? 'Space' : k.key}</p> : <p className="text-zinc-600 dark:text-zinc-300">Click here, then press any key</p>}
      </div>
      {k && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {[['key', k.key], ['code', k.code], ['keyCode (old)', String(k.keyCode)], ['Held with', mods.join(' + ') || 'nothing'], ['Where', ['standard', 'left', 'right', 'number pad'][k.location] ?? '—'], ['Repeating', k.repeat ? 'yes' : 'no']].map(([a, b]) => <div key={a} className="rounded-xl bg-zinc-100/70 dark:bg-white/[0.05] px-3 py-2"><dt className="text-[11px] text-zinc-600 dark:text-zinc-300">{a}</dt><dd className="font-mono text-zinc-900 dark:text-white break-all">{b}</dd></div>)}
        </dl>
      )}
      {hist.length > 0 && <p className="text-xs text-zinc-600 dark:text-zinc-300">Last keys: <span className="font-mono">{hist.join(' · ')}</span></p>}
    </div>
  );
}

/** Sample data: made-up people for testing a spreadsheet, form or app. */
function Mock() {
  const [fields, setFields] = useState<MockField[]>(['id', 'name', 'email', 'city', 'score']), [n, setN] = useState(20), [fmt, setFmt] = useState<'csv' | 'json'>('csv'), [seed, setSeed] = useState(0);
  const rows = useMemo(() => { void seed; return mockRows(n, fields); }, [n, fields, seed]);
  const out = fmt === 'json' ? JSON.stringify(rows, null, 2) : tableAs([fields, ...rows.map((r) => fields.map((f) => String(r[f])))], 'csv');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fields">{MOCK_FIELDS.map((f) => <Btn key={f} on={fields.includes(f)} onClick={() => setFields(fields.includes(f) ? fields.filter((x) => x !== f) : MOCK_FIELDS.filter((x) => x === f || fields.includes(x)))}>{f}</Btn>)}</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`Rows: ${n}`}><input type="range" min={1} max={500} value={n} onChange={(e) => setN(+e.target.value)} className="accent-pink-500" /></Field>
        <Segments label="Format" value={fmt} onChange={setFmt} options={[['csv', 'CSV'], ['json', 'JSON']] as const} />
        <Btn onClick={() => setSeed(seed + 1)}>New data</Btn>
        <Btn onClick={() => save(`sample.${fmt}`, out, fmt === 'json' ? 'application/json' : 'text/csv')}><Download className="w-3.5 h-3.5" aria-hidden />Download</Btn>
        <CopyBtn text={out} />
      </div>
      <textarea readOnly className={cn(area, 'min-h-[260px]')} value={out} aria-label="Sample data" />
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Made up on this device. Emails use example.com, which never delivers mail.</p>
    </div>
  );
}
