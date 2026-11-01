'use client';

import { useMemo, useState } from 'react';
import { Download, Plus, Minus } from 'lucide-react';
import { parseTable } from '@/lib/quick-tools';
import { chmodOctal, chmodText, csvToSql, jsonToTs, subnet } from '@/lib/tools-5';
import { cn } from '@/lib/utils';
import { Btn, CopyBtn, Field, area, save } from './QuickTools';
import { useKept } from './kept';
import { Stat } from './bits';

// Collaborate → Create → Code, fifth set (M75): CSV to SQL, JSON to TypeScript, link-preview tags,
// file permissions, a flexbox playground and an IPv4 subnet calculator. All on the device.

export type WebId = 'sqlgen' | 'jsonts' | 'metatags' | 'chmod' | 'flexbox' | 'subnet';

export function WebTool({ id }: { id: WebId }) {
  const T = { sqlgen: SqlGen, jsonts: JsonTs, metatags: MetaTags, chmod: Chmod, flexbox: Flexbox, subnet: Subnet }[id];
  return <T />;
}

/** CSV to SQL: a table and its rows as CREATE TABLE and INSERT statements (text quoted safely). */
function SqlGen() {
  const [t, setT] = useKept('uv-draft-sqlgen', 'name,class,score\nAisha,7A,82\nBen,7B,74\nO\'Brien,7A,91');
  const [table, setTable] = useState('students');
  const sql = useMemo(() => csvToSql(parseTable(t), table), [t, table]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="CSV or pasted table (first row: column names)"><textarea className={cn(area, 'min-h-[220px]')} value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <Field label="SQL"><textarea readOnly className={cn(area, 'min-h-[220px]')} value={sql} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-2"><Field label="Table name"><input className="input w-48 font-mono" value={table} onChange={(e) => setTable(e.target.value)} /></Field><CopyBtn text={sql} /><Btn onClick={() => save(`${table || 'table'}.sql`, sql, 'application/sql')}><Download className="w-3.5 h-3.5" aria-hidden />.sql</Btn></div>
    </div>
  );
}

/** JSON to TypeScript: interfaces for a JSON sample (an API answer, a settings file). */
function JsonTs() {
  const [t, setT] = useKept('uv-draft-jsonts', '{\n  "id": 7,\n  "name": "Aisha",\n  "tags": ["science", "art"],\n  "school": { "name": "UniVerse High", "city": "Pune" },\n  "active": true\n}');
  const [root, setRoot] = useState('Student');
  const out = useMemo(() => { try { return { ts: jsonToTs(JSON.parse(t), root || 'Root') }; } catch (e) { return { err: (e as Error).message }; } }, [t, root]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="JSON"><textarea className={cn(area, 'min-h-[240px]', 'err' in out && 'ring-2 ring-rose-500')} value={t} onChange={(e) => setT(e.target.value)} aria-invalid={'err' in out} /></Field>
        <Field label="TypeScript"><textarea readOnly className={cn(area, 'min-h-[240px]')} value={'ts' in out ? out.ts ?? '' : ''} /></Field>
      </div>
      {'err' in out && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Not valid JSON: {out.err}</p>}
      <div className="flex flex-wrap items-end gap-2"><Field label="Name for the top type"><input className="input w-48 font-mono" value={root} onChange={(e) => setRoot(e.target.value.replace(/\W/g, ''))} /></Field>{'ts' in out && <CopyBtn text={out.ts ?? ''} />}</div>
    </div>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** Link preview: the tags a page needs so a shared link shows a title, text and picture; with a preview. */
function MetaTags() {
  const [m, setM] = useKept('uv-metatags', { title: 'Our Science Fair', desc: 'Projects, prizes and ideas from 40 student teams. Friday in the school hall.', url: 'https://example.com/fair', image: 'https://example.com/fair.png', site: 'UniVerse School' });
  const tags = [`<title>${esc(m.title)}</title>`, `<meta name="description" content="${esc(m.desc)}" />`, `<meta property="og:title" content="${esc(m.title)}" />`, `<meta property="og:description" content="${esc(m.desc)}" />`, `<meta property="og:url" content="${esc(m.url)}" />`, `<meta property="og:image" content="${esc(m.image)}" />`, `<meta property="og:site_name" content="${esc(m.site)}" />`, '<meta property="og:type" content="website" />', '<meta name="twitter:card" content="summary_large_image" />'].join('\n');
  const host = (() => { try { return new URL(m.url).host; } catch { return m.url; } })();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        {(['title', 'desc', 'url', 'image', 'site'] as const).map((k) => <Field key={k} label={{ title: `Title (${m.title.length}/60)`, desc: `Description (${m.desc.length}/160)`, url: 'Page address', image: 'Picture address (1200 × 630)', site: 'Site name' }[k]}><input className={cn('input', (k === 'title' && m.title.length > 60) || (k === 'desc' && m.desc.length > 160) ? 'ring-2 ring-amber-500' : '')} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Field>)}
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl overflow-hidden ring-1 ring-black/10 bg-white text-zinc-900 max-w-md" aria-label="How the link looks when shared">
          <div className="aspect-[1200/630] bg-gradient-to-br from-indigo-200 to-pink-200 grid place-items-center text-sm text-[#4b5068]">picture: {m.image.split('/').pop()}</div>
          <div className="p-3"><p className="text-xs uppercase text-[#4b5068]">{host}</p><p className="font-bold line-clamp-1">{m.title}</p><p className="text-sm text-[#4b5068] line-clamp-2">{m.desc}</p></div>
        </div>
        <pre className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 whitespace-pre-wrap break-all">{tags}</pre>
        <CopyBtn text={tags} label="Copy the tags" />
      </div>
    </div>
  );
}

const WHO = ['Owner', 'Group', 'Everyone'], WHAT = [['r', 'read', 4], ['w', 'write', 2], ['x', 'run', 1]] as const;
/** File permissions: tick boxes ↔ 755 ↔ rwxr-xr-x, with the command to use. */
function Chmod() {
  const [oct, setOct] = useState('755'), [txt, setTxt] = useState('rwxr-xr-x'), [err, setErr] = useState('');
  const digits = /^[0-7]{3}$/.test(oct) ? [...oct].map(Number) : [0, 0, 0];
  const set = (o: string) => { setOct(o); try { setTxt(chmodText(o)); setErr(''); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="space-y-4">
      <table className="text-sm">
        <thead><tr><th /><th className="px-3 text-zinc-600 dark:text-zinc-300 font-semibold">Read</th><th className="px-3 text-zinc-600 dark:text-zinc-300 font-semibold">Write</th><th className="px-3 text-zinc-600 dark:text-zinc-300 font-semibold">Run</th></tr></thead>
        <tbody>{WHO.map((w, i) => <tr key={w}><th className="pe-4 py-1.5 text-start font-semibold text-zinc-900 dark:text-white">{w}</th>{WHAT.map(([, l, bit]) => <td key={l} className="text-center"><input type="checkbox" className="accent-pink-500 w-5 h-5" aria-label={`${w} can ${l}`} checked={!!(digits[i] & bit)} onChange={(e) => set(digits.map((d, k) => (k === i ? (e.target.checked ? d | bit : d & ~bit) : d)).join(''))} /></td>)}</tr>)}</tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Number"><input className="input w-24 font-mono text-lg" value={oct} onChange={(e) => set(e.target.value)} /></Field>
        <Field label="Letters"><input className="input w-40 font-mono text-lg" value={txt} onChange={(e) => { setTxt(e.target.value); try { setOct(chmodOctal(e.target.value)); setErr(''); } catch (x) { setErr((x as Error).message); } }} /></Field>
        <CopyBtn text={`chmod ${oct} file`} label={`Copy “chmod ${oct} file”`} />
      </div>
      {err && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{err}</p>}
      <div className="flex flex-wrap gap-1.5">{['644', '755', '600', '700', '777'].map((o) => <Btn key={o} on={oct === o} onClick={() => set(o)}>{o}</Btn>)}</div>
      <p className="text-xs text-zinc-600 dark:text-zinc-300">644 for web pages and pictures, 755 for folders and scripts, 600 for private keys. Avoid 777: anyone could change the file.</p>
    </div>
  );
}

/** Flexbox playground: line boxes up with direction, wrap, justify and align; copy the CSS. */
function Flexbox() {
  const [s, setS] = useKept('uv-flexbox', { dir: 'row', wrap: 'nowrap', justify: 'flex-start', align: 'stretch', gap: 12, n: 5 });
  const sel = (k: 'dir' | 'wrap' | 'justify' | 'align', label: string, opts: string[]) => <Field label={label}><select className="input font-mono text-sm" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select></Field>;
  const css = `.box {\n  display: flex;\n  flex-direction: ${s.dir};\n  flex-wrap: ${s.wrap};\n  justify-content: ${s.justify};\n  align-items: ${s.align};\n  gap: ${s.gap}px;\n}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {sel('dir', 'Direction', ['row', 'row-reverse', 'column', 'column-reverse'])}{sel('wrap', 'Wrap', ['nowrap', 'wrap', 'wrap-reverse'])}
        {sel('justify', 'Along the line (justify)', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'])}{sel('align', 'Across (align)', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'])}
      </div>
      <div className="flex flex-wrap items-end gap-3"><Field label={`Gap: ${s.gap}px`}><input type="range" min={0} max={40} value={s.gap} onChange={(e) => setS({ ...s, gap: +e.target.value })} className="accent-pink-500" /></Field><div className="flex items-center gap-1"><Btn onClick={() => setS({ ...s, n: Math.max(1, s.n - 1) })}><Minus className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">One box fewer</span></Btn><span className="font-mono tabular-nums text-zinc-900 dark:text-white">{s.n}</span><Btn onClick={() => setS({ ...s, n: Math.min(14, s.n + 1) })}><Plus className="w-3.5 h-3.5" aria-hidden /><span className="sr-only">One more box</span></Btn></div></div>
      <div className="h-64 rounded-2xl bg-zinc-100 dark:bg-white/[0.04] ring-1 ring-zinc-200 dark:ring-white/10 p-3 overflow-hidden" style={{ display: 'flex', flexDirection: s.dir as React.CSSProperties['flexDirection'], flexWrap: s.wrap as React.CSSProperties['flexWrap'], justifyContent: s.justify, alignItems: s.align, gap: s.gap }} role="img" aria-label="Flexbox preview">
        {Array.from({ length: s.n }, (_, i) => <div key={i} className="grid place-items-center rounded-lg bg-pink-500 font-bold text-[#171f44] transition-all duration-300" style={{ minWidth: 48 + (i % 3) * 16, minHeight: 40 + (i % 2) * 18 }}>{i + 1}</div>)}
      </div>
      <pre className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">{css}</pre>
      <CopyBtn text={css} label="Copy the CSS" />
    </div>
  );
}

/** IPv4 subnet calculator: an address and /bits into the network, its range and how many devices fit. */
function Subnet() {
  const [v, setV] = useState('192.168.1.42/24');
  const r = useMemo(() => { try { return subnet(v); } catch (e) { return { err: (e as Error).message }; } }, [v]);
  return (
    <div className="space-y-3">
      <Field label="Address with /bits"><input className={cn('input font-mono text-lg w-64', 'err' in r && 'ring-2 ring-rose-500')} value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-1.5">{[8, 16, 20, 24, 26, 28, 30].map((b) => <Btn key={b} on={v.endsWith(`/${b}`)} onClick={() => setV(`${v.split('/')[0]}/${b}`)}>/{b}</Btn>)}</div>
      {'err' in r ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{r.err}</p> : (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm"><Stat k="Network" v={r.network} /><Stat k="Mask" v={r.mask} /><Stat k="Broadcast" v={r.broadcast} /><Stat k="First device" v={r.first} /><Stat k="Last device" v={r.last} /><Stat k="Devices that fit" v={r.hosts.toLocaleString()} /><Stat k="Kind" v={r.private ? 'Private (home, school)' : 'Public'} /></dl>
      )}
    </div>
  );
}
