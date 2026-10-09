'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ChevronRight, ClipboardCheck, Loader2, MapPin, PackagePlus, Printer, Trash2, Undo2, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Field, SearchField } from '@/components/ui/Field';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { LoadError } from '@/components/ui/LoadError';
import { confirmDialog } from '@/components/ui/Dialogs';
import { QrCode } from '@/components/ui/QrCode';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { ScanField } from '@/components/library/ScanField';

// The equipment register (Stage 5 · B15.5; src/server/registers.ts): every item with its tag,
// place, holder and state; add items (several at once, with scanned or made tags), print QR
// labels, lend, take back, move, change state, and a stock check that scans tags in a place.

const STATUS: Record<string, string> = { IN_USE: 'In use', IN_STORE: 'In store', REPAIR: 'In repair', LOST: 'Lost', RETIRED: 'Retired' };
interface Item { id: string; tag: string; name: string; category: string | null; location: string | null; status: string; lastSeenAt: string | null; assignedTo: { id: string; name: string } | null }
interface ListData { assets: Item[]; byStatus: Record<string, number>; categories: { name: string; count: number }[] }
interface Person { id: string; name: string; email: string; avatar: string | null; role: string }
const card = 'rounded-3xl tone-panel border border-zinc-200 dark:border-white/10';

export function usePeople(students: boolean) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data } = useSWR<{ people: Person[] }>(dq.length >= 2 ? `/api/registers/people?q=${encodeURIComponent(dq)}${students ? '&students=1' : ''}` : null, authedJson);
  return { q, setQ, searching: dq.length >= 2, people: data?.people ?? null };
}

export function PersonPicker({ students, label, onPick }: { students: boolean; label: string; onPick: (p: Person) => void }) {
  const { q, setQ, searching, people } = usePeople(students);
  return (
    <div>
      <SearchField value={q} onChange={setQ} placeholder={label} />
      {searching && (
        <ul className="mt-1 divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
          {!people ? <li className="py-2 text-sm text-zinc-500">Searching…</li> : people.length === 0 ? <li className="py-2 text-sm text-zinc-500">Nobody matches.</li> : people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setQ(''); }} className="w-full flex items-center gap-3 py-2 px-1 rounded-xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <Avatar name={p.name} src={p.avatar} size={28} />
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span><span className="block text-xs text-zinc-500 truncate">{p.email}</span></span>
                <UserPlus className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EquipmentRegister() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const key = `/api/registers/assets?${new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(status ? { status } : {}), ...(category ? { category } : {}) })}`;
  const { data, error, mutate, isLoading } = useSWR<ListData>(key, authedJson, { keepPreviousData: true });
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (error && !data) return <LoadError onRetry={() => mutate()} />;
  if (!data) return <ContentSkeleton variant="list" />;
  const total = Object.values(data.byStatus).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-sm"><PackagePlus className="w-4 h-4" /> Add equipment</button>
        <button type="button" onClick={() => setChecking(true)} disabled={!total} className="btn-secondary btn-sm"><ClipboardCheck className="w-4 h-4" /> Stock check</button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Name, tag, serial, place or person" className="flex-1" />
        <select aria-label="State" value={status} onChange={(e) => setStatus(e.target.value)} className="input sm:w-40">
          <option value="">Every state ({total})</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v} ({data.byStatus[k] ?? 0})</option>)}
        </select>
        {data.categories.length > 0 && (
          <select aria-label="Kind" value={category} onChange={(e) => setCategory(e.target.value)} className="input sm:w-44">
            <option value="">Every kind</option>
            {data.categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
          </select>
        )}
      </div>
      {data.assets.length === 0 ? <p className={`${card} p-8 text-center text-sm text-zinc-500`}>{total ? 'Nothing matches.' : 'No equipment yet. Add items and print their QR labels.'}</p> : (
        <motion.ul variants={list} initial="hidden" animate="show" className={cn(card, 'p-2 sm:p-3 divide-y divide-zinc-200/70 dark:divide-white/[0.06] transition-opacity', isLoading && 'opacity-60')}>
          {data.assets.map((a) => (
            <motion.li key={a.id} variants={fadeUp}>
              <button type="button" onClick={() => { haptic('tap'); setOpen(a.id); }} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <span className="w-20 shrink-0 font-mono text-xs text-zinc-500">{a.tag}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">{a.name}</span>
                  <span className="block text-xs text-zinc-500 truncate">{[a.category, a.assignedTo ? `with ${a.assignedTo.name}` : a.location].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0', a.status === 'IN_USE' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : a.status === 'REPAIR' || a.status === 'LOST' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300')}>{STATUS[a.status] ?? a.status}</span>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
      {adding && <AddEquipment categories={data.categories.map((c) => c.name)} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void mutate(); }} />}
      {checking && <StockCheck onClose={() => { setChecking(false); void mutate(); }} />}
      {open && <ItemSheet key={open} id={open} onClose={() => setOpen(null)} onChanged={() => void mutate()} />}
    </div>
  );
}

function AddEquipment({ categories, onClose, onAdded }: { categories: string[]; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ name: '', category: '', location: '', status: 'IN_USE', serial: '', purchasedAt: '', cost: '', currency: 'INR', notes: '' });
  const [count, setCount] = useState(1);
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((c) => ({ ...c, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authedJson<{ tags: string[] }>('/api/registers/assets', { method: 'POST', body: JSON.stringify({ ...f, count, tags: tags.split(/[\s,;]+/).filter(Boolean) }) });
      haptic('success');
      toast.success(`${r.tags.length} added`, { description: `Tags: ${r.tags.slice(0, 6).join(', ')}${r.tags.length > 6 ? '…' : ''}. Open an item to print its label.` });
      onAdded();
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t add it.')); setBusy(false); }
  };
  return (
    <Sheet title="Add equipment" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="What">{(p) => <input {...p} required maxLength={120} value={f.name} onChange={set('name')} className="input" placeholder="Projector, laptop, microscope…" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">{(p) => <><input {...p} list="asset-kinds" maxLength={60} value={f.category} onChange={set('category')} className="input" placeholder="IT, Lab, Sports…" /><datalist id="asset-kinds">{categories.map((c) => <option key={c} value={c} />)}</datalist></>}</Field>
          <Field label="Where">{(p) => <input {...p} maxLength={120} value={f.location} onChange={set('location')} className="input" placeholder="Room 12" />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State">{(p) => <select {...p} value={f.status} onChange={set('status')} className="input">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
          <Field label="How many">{(p) => <input {...p} type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="input" />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serial (optional)">{(p) => <input {...p} maxLength={80} value={f.serial} onChange={set('serial')} className="input" />}</Field>
          <Field label="Bought on (optional)">{(p) => <input {...p} type="date" value={f.purchasedAt} onChange={set('purchasedAt')} className="input" />}</Field>
        </div>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Cost each (optional)">{(p) => <input {...p} inputMode="decimal" value={f.cost} onChange={(e) => setF((c) => ({ ...c, cost: e.target.value.replace(/[^\d.]/g, '') }))} className="input" />}</Field>
          <Field label="Currency">{(p) => <select {...p} value={f.currency} onChange={set('currency')} className="input">{['INR', 'USD', 'EUR', 'GBP', 'AED'].map((x) => <option key={x}>{x}</option>)}</select>}</Field>
        </div>
        <Field label="Tags already on the items (optional)" hint="Scan existing stickers, or leave empty and print the tags the app makes.">{(p) => <textarea {...p} rows={2} value={tags} onChange={(e) => setTags(e.target.value)} className="input font-mono text-sm" />}</Field>
        <button type="submit" disabled={busy || !f.name.trim()} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />} Add {count > 1 ? `${count} items` : 'it'}</button>
      </form>
    </Sheet>
  );
}

interface Detail { id: string; tag: string; name: string; category: string | null; location: string | null; status: string; serial: string | null; purchasedAt: string | null; cost: number | null; currency: string | null; notes: string | null; lastSeenAt: string | null; assignedTo: { id: string; name: string; email: string } | null; events: { id: string; type: string; note: string | null; at: string; by: string | null }[] }
const EVENT: Record<string, string> = { created: 'Added', edited: 'Details changed', moved: 'Moved', lent: 'Lent', returned: 'Taken back', status: 'State', seen: 'Seen' };

function ItemSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const key = `/api/registers/assets/${id}`;
  const { data, mutate } = useSWR<Detail>(key, authedJson);
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState('');
  const label = useRef<HTMLDivElement>(null);
  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const r = await authedJson<{ deleted?: boolean }>(key, { method: 'POST', body: JSON.stringify(body) });
      haptic('success'); toast.success(done);
      if (r.deleted) { onChanged(); onClose(); return; }
      setMove(''); await mutate(); onChanged();
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t do that.')); }
    finally { setBusy(false); }
  };
  const print = () => {
    const svg = label.current?.querySelector('svg')?.outerHTML;
    const w = window.open('', '_blank', 'width=420,height=520');
    if (!w || !svg || !data) return;
    w.document.title = `Label ${data.tag}`;
    const style = w.document.createElement('style');
    style.textContent = 'body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:24px} .tag{font:700 20px ui-monospace,monospace;margin-top:8px} .name{font-size:13px;color:#444}';
    w.document.head.appendChild(style);
    const wrap = w.document.createElement('div');
    wrap.style.textAlign = 'center';
    wrap.innerHTML = svg;
    const tag = w.document.createElement('div'); tag.className = 'tag'; tag.textContent = data.tag;
    const name = w.document.createElement('div'); name.className = 'name'; name.textContent = data.name;
    wrap.append(tag, name);
    w.document.body.appendChild(wrap);
    w.focus(); w.print();
  };
  return (
    <Sheet title={data?.name ?? 'Equipment'} onClose={onClose}>
      {!data ? <ContentSkeleton variant="list" /> : (
        <div className="space-y-4">
          <div className="flex gap-4 items-start">
            <div ref={label} className="shrink-0 rounded-xl bg-white p-1"><QrCode value={data.tag} size={96} title={`QR label for ${data.tag}`} /></div>
            <div className="min-w-0 text-sm space-y-0.5">
              <p className="font-mono font-bold text-zinc-900 dark:text-white">{data.tag}</p>
              <p className="text-zinc-600 dark:text-zinc-300">{[data.category, STATUS[data.status]].filter(Boolean).join(' · ')}</p>
              {data.location && <p className="text-zinc-600 dark:text-zinc-300"><MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden /> {data.location}</p>}
              {data.serial && <p className="text-xs text-zinc-500">Serial {data.serial}</p>}
              {data.lastSeenAt && <p className="text-xs text-zinc-500">Last seen {formatDistanceToNow(new Date(data.lastSeenAt), { addSuffix: true })}</p>}
              <button type="button" onClick={print} className="btn-ghost btn-sm -ml-2"><Printer className="w-4 h-4" /> Print label</button>
            </div>
          </div>
          <section className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-3 space-y-2" aria-label="Who has it">
            {data.assignedTo ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-zinc-800 dark:text-zinc-100">With <span className="font-semibold">{data.assignedTo.name}</span></p>
                <button type="button" disabled={busy} onClick={() => void act({ action: 'return' }, 'Taken back')} className="btn-secondary btn-sm"><Undo2 className="w-4 h-4" /> Take back</button>
              </div>
            ) : <PersonPicker students={false} label="Lend to: name or email" onPick={(p) => void act({ action: 'lend', userId: p.id }, `Lent to ${p.name}`)} />}
          </section>
          <div className="flex gap-2">
            <input aria-label="Move to" value={move} onChange={(e) => setMove(e.target.value)} maxLength={120} className="input flex-1 min-w-0" placeholder="Move to… (room or place)" />
            <button type="button" disabled={busy || !move.trim()} onClick={() => void act({ action: 'move', location: move }, 'Moved')} className="btn-secondary shrink-0">Move</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="State" value={data.status} disabled={busy} onChange={(e) => void act({ action: 'status', status: e.target.value }, `Now: ${STATUS[e.target.value]}`)} className="input w-auto">
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={() => void act({ action: 'seen' }, 'Marked seen')} className="btn-ghost btn-sm"><ClipboardCheck className="w-4 h-4" /> Seen today</button>
          </div>
          <section aria-label="History">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">History</p>
            <ol className="space-y-1 text-xs">
              {data.events.map((e) => <li key={e.id} className="text-zinc-600 dark:text-zinc-300"><span className="tabular-nums text-zinc-500">{format(new Date(e.at), 'd MMM yyyy')}</span> · {EVENT[e.type] ?? e.type}{e.note ? `: ${e.note}` : ''}{e.by ? <span className="text-zinc-500"> ({e.by})</span> : null}</li>)}
            </ol>
          </section>
          {!data.assignedTo && <button type="button" disabled={busy} onClick={async () => { if (await confirmDialog({ title: `Delete ${data.tag}?`, message: 'It and its history leave the register. To keep the history, set it to Retired instead.', confirmLabel: 'Delete', destructive: true })) void act({ action: 'delete' }, 'Deleted'); }} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400"><Trash2 className="w-4 h-4" /> Delete</button>}
        </div>
      )}
    </Sheet>
  );
}

function StockCheck({ onClose }: { onClose: () => void }) {
  const [location, setLocation] = useState('');
  const [code, setCode] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ seen: { tag: string; name: string }[]; unknown: string[]; notSeenThere: { tag: string; name: string }[] } | null>(null);
  const add = (c: string) => { const t = c.trim().toUpperCase(); if (t && !tags.includes(t)) { setTags((cur) => [t, ...cur]); haptic('tap'); } setCode(''); };
  const finish = async () => {
    setBusy(true);
    try { setResult(await authedJson('/api/registers/assets/check', { method: 'POST', body: JSON.stringify({ tags, location }) })); haptic('success'); }
    catch (e) { toast.error(errorMessage(e, 'Couldn’t finish the check.')); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Stock check" onClose={onClose}>
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="text-emerald-700 dark:text-emerald-300 font-semibold">{result.seen.length} item{result.seen.length === 1 ? '' : 's'} marked seen{location ? ` in ${location}` : ''}.</p>
          {result.unknown.length > 0 && <p className="text-amber-800 dark:text-amber-300">Not in the register: {result.unknown.join(', ')}</p>}
          {location && (result.notSeenThere.length ? (
            <div><p className="font-semibold text-rose-700 dark:text-rose-300">Should be in {location} but weren’t scanned:</p><ul className="text-xs text-zinc-600 dark:text-zinc-300">{result.notSeenThere.map((a) => <li key={a.tag}><span className="font-mono">{a.tag}</span> {a.name}</li>)}</ul></div>
          ) : <p className="text-zinc-600 dark:text-zinc-300">Everything listed for {location} was found.</p>)}
          <button type="button" onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Place (optional)" hint="Scanned items are recorded here, and you’ll see what should be here but wasn’t scanned.">{(p) => <input {...p} maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} className="input" placeholder="Computer lab" />}</Field>
          <ScanField label="Scan tags" value={code} onChange={setCode} onScan={add} autoFocus placeholder="Scan each QR label" />
          {tags.length > 0 && <p className="text-xs text-zinc-600 dark:text-zinc-300"><span className="font-semibold">{tags.length} scanned:</span> <span className="font-mono">{tags.slice(0, 20).join(', ')}{tags.length > 20 ? '…' : ''}</span></p>}
          <button type="button" disabled={busy || !tags.length} onClick={() => void finish()} className="btn-primary w-full">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Finish the check</button>
        </div>
      )}
    </Sheet>
  );
}
