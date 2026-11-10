'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, Eye, Loader2, LocateFixed, Package, PackageCheck, Printer, QrCode as QrIcon, Truck, X } from 'lucide-react';
import { CardHead } from '@/components/ui/CardMenu';
import { QrCode } from '@/components/ui/QrCode';
import { Sheet } from '@/components/ui/Sheet';
import { StatusBadge, type Tone } from '@/components/ui/StatusBadge';
import Link from '@/components/ui/Link';
import { api, errorMessage } from '@/lib/api';
import { fetcher } from '@/lib/fetcher';
import { AID_LABEL, firstName, type AidStep } from '@/lib/relief';
import { useAuthStore } from '@/store/auth';

// M151: an organisation's aid boxes. Coordinators pack one (what's in it, how many, where it goes) and
// get a code with a QR label; any member logs it on the way (with the town) and delivered. Donors follow
// the trip on /aid/<code>: towns, times, and (M154) a map from where members add it, rounded to about
// 500 m, and their first name when they choose; never who received it.

export interface AidBox {
  id: string; code: string; contents: string; boxes: number; fromPlace: string | null; toPlace: string;
  status: AidStep; createdAt: string; updatedAt: string; followers: number;
}
const TONE: Record<AidStep, Tone> = { PACKED: 'blue', ON_THE_WAY: 'amber', DELIVERED: 'green' };
const link = (code: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/aid/${code}`;
const L = 'text-sm text-zinc-700 dark:text-zinc-200';

/** M154: "Show my first name to donors", remembered on this device (a convenience; off by default). */
function ShowName({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  const name = firstName(useAuthStore((st) => st.user?.name));
  if (!name) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
      <input type="checkbox" checked={on} onChange={(e) => { set(e.target.checked); try { localStorage.setItem('relief-aid-show-name', e.target.checked ? '1' : ''); } catch { /* private mode */ } }} className="w-4 h-4 accent-orange-500" />
      Show my first name (<span translate="no">{name}</span>) to donors
    </label>
  );
}
const showNameAtFirst = () => { try { return localStorage.getItem('relief-aid-show-name') === '1'; } catch { return false; } };

export function AidBoxes({ orgId, place }: { orgId: string; place: string | null }) {
  const { data, mutate } = useSWR<{ run: boolean; boxes: AidBox[] }>(`/relief/orgs/${orgId}/aid`, fetcher);
  const [label, setLabel] = useState<AidBox | null>(null);
  const [moving, setMoving] = useState<{ box: AidBox; to: 'ON_THE_WAY' | 'DELIVERED' } | null>(null);
  const boxes = data?.boxes ?? [];
  const count = (s: AidStep) => boxes.filter((b) => b.status === s).length;
  return (
    <div className="space-y-6">
      {data?.run && <PackForm orgId={orgId} place={place} onDone={(b) => { void mutate(); setLabel(b); }} />}
      <section className="card" aria-label="Aid boxes">
        <CardHead title="Aid boxes" sub={boxes.length ? `${count('PACKED')} packed · ${count('ON_THE_WAY')} on the way · ${count('DELIVERED')} delivered` : 'Each box gets a code: donors follow its trip by its link or QR code'} />
        {!data ? <div className="h-28 rounded-xl skeleton" /> : boxes.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No boxes yet.{data.run ? ' Pack one above: you get a label to print and a link to send your donors.' : ' Your coordinators add them.'}</p>
        ) : (
          <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.07]">
            {boxes.map((b) => (
              <li key={b.id} className="py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-[var(--fill)] text-zinc-700 dark:text-zinc-200" aria-hidden>{b.status === 'DELIVERED' ? <PackageCheck className="w-[18px] h-[18px]" /> : b.status === 'ON_THE_WAY' ? <Truck className="w-[18px] h-[18px]" /> : <Package className="w-[18px] h-[18px]" />}</span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white" translate="no">{b.contents}{b.boxes > 1 && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {b.boxes} boxes</span>}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400"><span translate="no">{b.fromPlace ? `${b.fromPlace} → ` : 'To '}{b.toPlace}</span> · <span className="font-mono">{b.code}</span> · {b.followers} following · {formatDistanceToNow(new Date(b.updatedAt), { addSuffix: true })}</p>
                </div>
                <StatusBadge tone={TONE[b.status]}>{AID_LABEL[b.status]}</StatusBadge>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setLabel(b)} className="btn-ghost btn-sm"><QrIcon className="w-4 h-4" aria-hidden />Label</button>
                  {b.status !== 'DELIVERED' && <>
                    <button type="button" onClick={() => setMoving({ box: b, to: 'ON_THE_WAY' })} className="btn-secondary btn-sm"><Truck className="w-4 h-4" aria-hidden />On the way</button>
                    <button type="button" onClick={() => setMoving({ box: b, to: 'DELIVERED' })} className="btn-secondary btn-sm"><Check className="w-4 h-4" aria-hidden />Delivered</button>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {label && <LabelSheet box={label} onClose={() => setLabel(null)} />}
      {moving && <StepSheet {...moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); void mutate(); }} />}
    </div>
  );
}

function PackForm({ orgId, place, onDone }: { orgId: string; place: string | null; onDone: (b: AidBox) => void }) {
  const [f, setF] = useState({ contents: '', boxes: '1', toPlace: '', fromPlace: '' });
  const [busy, setBusy] = useState(false);
  const [showName, setShowName] = useState(showNameAtFirst);
  const pack = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<AidBox>(`/relief/orgs/${orgId}/aid`, { ...f, boxes: Number(f.boxes) || 1, fromPlace: f.fromPlace || undefined, showName });
      toast.success('Box packed', { description: 'Print its label and send the link to your donors.' });
      setF({ ...f, contents: '', toPlace: '' });
      onDone({ ...r.data, followers: 0 });
    } catch (err) { toast.error(errorMessage(err, 'Could not add the box.')); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5" aria-labelledby="pack-h">
      <h2 id="pack-h" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Package className="w-5 h-5 text-orange-500" aria-hidden />Pack a box</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-[75ch]">Donors see what is in it, the towns it passes and when, never who packed, carried or received it.</p>
      <form onSubmit={(e) => void pack(e)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_minmax(0,1.3fr)_minmax(0,1.3fr)] sm:items-end">
        <label className={L}>What is in it<input required maxLength={200} value={f.contents} onChange={(e) => setF({ ...f, contents: e.target.value })} className="input mt-1" placeholder="e.g. Hygiene kits for 20 families" /></label>
        <label className={L}>Boxes<input type="number" min={1} max={10000} value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} className="input mt-1" /></label>
        <label className={L}>From<input maxLength={120} value={f.fromPlace} onChange={(e) => setF({ ...f, fromPlace: e.target.value })} className="input mt-1" placeholder={place ?? 'Our base'} /></label>
        <label className={L}>Going to<input required maxLength={120} value={f.toPlace} onChange={(e) => setF({ ...f, toPlace: e.target.value })} className="input mt-1" placeholder="A town or an area" /></label>
        <div className="sm:col-span-4"><ShowName on={showName} set={setShowName} /></div>
        <button type="submit" disabled={busy || !f.contents.trim() || !f.toPlace.trim()} className="btn-primary btn-sm sm:col-span-4 justify-self-start">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}Pack it and make a label</button>
      </form>
    </section>
  );
}

function LabelSheet({ box, onClose }: { box: AidBox; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link(box.code)); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { toast.error('Could not copy. Select the link and copy it.'); }
  };
  return (
    <Sheet title="Box label" onClose={onClose} footer={
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/aid/${box.code}`} className="btn-ghost btn-sm me-auto"><Eye className="w-4 h-4" aria-hidden />What donors see</Link>
        <button type="button" onClick={() => void copy()} className="btn-secondary btn-sm">{copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}{copied ? 'Copied' : 'Copy the link'}</button>
        <button type="button" onClick={() => window.print()} className="btn-primary btn-sm"><Printer className="w-4 h-4" aria-hidden />Print</button>
      </div>
    }>
      <div className="print-sheet">
        <div className="trace-label mx-auto w-fit rounded-xl border border-zinc-200 bg-white p-4 text-center text-zinc-900">
          <QrCode value={link(box.code)} size={168} title={`QR code for aid box ${box.code}`} className="mx-auto" />
          <p className="mt-2 font-mono text-base font-semibold tracking-wider">{box.code}</p>
          <p className="mt-1 max-w-[16rem] text-xs text-zinc-700" translate="no">{box.contents}</p>
          <p className="mt-0.5 text-xs text-zinc-700">Follow this box: scan the code</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300 break-all">Or send the link: <span className="font-mono text-zinc-900 dark:text-white">{link(box.code)}</span></p>
    </Sheet>
  );
}

function StepSheet({ box, to, onClose, onDone }: { box: AidBox; to: 'ON_THE_WAY' | 'DELIVERED'; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ place: to === 'DELIVERED' ? box.toPlace : '', note: '' });
  const [busy, setBusy] = useState(false);
  const [showName, setShowName] = useState(showNameAtFirst);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!('geolocation' in navigator)) { toast.error('This device can’t share its location.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((g) => { setPos({ lat: g.coords.latitude, lng: g.coords.longitude }); setLocating(false); }, () => { setLocating(false); toast.error('Allow location for this site to add where it is.'); }, { timeout: 10_000, maximumAge: 120_000 });
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/relief/aid/${box.id}/step`, { status: to, ...f, ...pos, showName });
      toast.success(to === 'DELIVERED' ? 'Marked delivered' : 'Logged on the way', { description: box.followers ? `${box.followers} following ${box.followers === 1 ? 'was' : 'were'} told.` : undefined });
      onDone();
    } catch (err) { toast.error(errorMessage(err, 'Could not save it.')); } finally { setBusy(false); }
  };
  return (
    <Sheet title={to === 'DELIVERED' ? 'Delivered' : 'On the way'} onClose={onClose} footer={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button type="submit" form="aid-step" disabled={busy} className="btn-primary btn-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : to === 'DELIVERED' ? <Check className="w-4 h-4" /> : <Truck className="w-4 h-4" />}Save</button>
      </div>
    }>
      <form id="aid-step" onSubmit={(e) => void save(e)} className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300" translate="no">{box.contents} → {box.toPlace}</p>
        <label className={`block ${L}`}>{to === 'DELIVERED' ? 'Delivered in' : 'Where is it now'} (a town, not an address)<input maxLength={120} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} className="input mt-1" placeholder="e.g. Kochi" /></label>
        <label className={`block ${L}`}>A short note for donors (optional)<input maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="input mt-1" placeholder={to === 'DELIVERED' ? 'Handed to the camp’s kitchen team' : 'Left the warehouse by truck'} /></label>
        {pos ? (
          <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"><Check className="w-4 h-4" aria-hidden />Where it is now is added (rounded to about 500 m).
            <button type="button" onClick={() => setPos(null)} className="btn-ghost btn-sm ms-auto"><X className="w-3.5 h-3.5" aria-hidden />Remove</button>
          </p>
        ) : (
          <button type="button" onClick={locate} disabled={locating} className="btn-secondary btn-sm">{locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" aria-hidden />}Add where it is now, for the map</button>
        )}
        <ShowName on={showName} set={setShowName} />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Don’t name anyone else: this shows on the public page. The people who receive aid are never shown.</p>
      </form>
    </Sheet>
  );
}
