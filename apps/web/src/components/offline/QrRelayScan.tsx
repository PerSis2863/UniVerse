'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Bell, BrainCircuit, ChevronLeft, ScanLine, ShieldAlert, ShieldCheck, StickyNote, Trash2 } from 'lucide-react';
import { OfflineQuiz } from '@/components/offline/OfflineWork';
import { checkRelay, unpackRelay, type RelayItem } from '@/lib/qr-relay';
import { offlineSupported } from '@/lib/offline-packs';
import { cn } from '@/lib/utils';

// Stage 5 · D17, offline classroom relay (student's Offline courses page): read the teacher's moving
// codes (QrRelayCamera), check the platform's signature, and keep what arrived on this device:
// notes and announcements to read, quizzes to take offline (sent when the phone is next online,
// like a saved course's quizzes). Nothing here needs a connection.

const Camera = dynamic(() => import('./QrRelayCamera'), { ssr: false });

type Check = 'ok' | 'unsigned' | 'unchecked';
interface Received { canonical: string; signature: string | null; keyId: string | null; check: Check; receivedAt: string }

const CACHE = 'course-packs-v1';
const INBOX = '/__offline-packs/relay.json';
const KEYS = 'uv-relay-keys';
const MAX_ITEMS = 30;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const parse = (r: Received): RelayItem | null => { try { return JSON.parse(r.canonical) as RelayItem; } catch { return null; } };

function savedKeys(): { kid: string; x: string }[] {
  try { const v = JSON.parse(localStorage.getItem(KEYS) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function readInbox(): Promise<Received[]> {
  if (!offlineSupported()) return [];
  const res = await (await caches.open(CACHE)).match(INBOX);
  const v = res ? await res.json().catch(() => []) : [];
  return Array.isArray(v) ? v : [];
}
async function writeInbox(list: Received[]) {
  await (await caches.open(CACHE)).put(INBOX, new Response(JSON.stringify(list.slice(0, MAX_ITEMS)), { headers: { 'Content-Type': 'application/json' } }));
}
const keyOf = (i: RelayItem | null) => (i ? `${i.kind}:${i.id}` : '');

const KIND = { NOTE: { label: 'Note', icon: StickyNote }, ANNOUNCEMENT: { label: 'Announcement', icon: Bell }, QUIZ: { label: 'Quiz', icon: BrainCircuit } } as const;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Trust({ check, from }: { check: Check; from: string }) {
  return check === 'ok'
    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" aria-hidden /> Checked: sent by {from}</span>
    : <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><ShieldAlert className="w-3.5 h-3.5" aria-hidden /> {check === 'unsigned' ? `Says it’s from ${from}, but it isn’t signed` : `Says it’s from ${from}; checked next time you’re online`}</span>;
}

const noSubscribe = () => () => {};

export function QrRelayInbox() {
  // Browser-only, read without a server/client mismatch (the server assumes yes).
  const supported = useSyncExternalStore(noSubscribe, offlineSupported, () => true);
  const [items, setItems] = useState<Received[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<Received | null>(null);

  const load = useCallback(() => { readInbox().then(setItems).catch(() => setItems([])); }, []);

  useEffect(() => {
    load();
    // Opened from the Live class page ("?scan=1"): start the camera straight away.
    const t = setTimeout(() => { if (new URLSearchParams(window.location.search).get('scan') === '1') setScanning(true); }, 0);
    if (!navigator.onLine) return () => clearTimeout(t);
    // Online: fetch the camera code now so it's on the device for class, and keep the school's
    // public key to check signatures offline; then check anything that couldn't be checked yet.
    const warm = setTimeout(() => { void import('./QrRelayCamera').catch(() => {}); }, 1500);
    fetch('/api/passport/jwks').then((r) => (r.ok ? r.json() : null)).then(async (j: { keys?: { kid?: string; x?: string }[] } | null) => {
      const keys = (j?.keys ?? []).filter((k): k is { kid: string; x: string } => typeof k.kid === 'string' && typeof k.x === 'string').map(({ kid, x }) => ({ kid, x }));
      if (!keys.length) return;
      try { localStorage.setItem(KEYS, JSON.stringify(keys)); } catch { /* private window */ }
      const list = await readInbox();
      if (!list.some((r) => r.check === 'unchecked')) return;
      const next: Received[] = [];
      for (const r of list) {
        if (r.check !== 'unchecked') { next.push(r); continue; }
        const c = await checkRelay(r.canonical, r.signature ? unb64(r.signature) : null, r.keyId, keys);
        if (c !== 'bad') next.push({ ...r, check: c }); // a forged one is dropped
      }
      await writeInbox(next);
      load();
    }).catch(() => {});
    return () => { clearTimeout(t); clearTimeout(warm); };
  }, [load]);

  const received = async (bytes: Uint8Array) => {
    setScanning(false);
    try {
      const { canonical, item, signature, keyId } = unpackRelay(bytes);
      const check = await checkRelay(canonical, signature, keyId, savedKeys());
      if (check === 'bad') { toast.error('This didn’t come from your school’s UniVerse, so it wasn’t saved.'); return; }
      const r: Received = { canonical, signature: signature ? b64(signature) : null, keyId, check, receivedAt: new Date().toISOString() };
      const list = await readInbox();
      await writeInbox([r, ...list.filter((x) => keyOf(parse(x)) !== keyOf(item))]);
      load();
      setOpen(r);
      toast.success(`Saved on this phone: ${item.title}`);
    } catch {
      toast.error('Those codes couldn’t be read as a UniVerse item. Try again.');
    }
  };

  const remove = async (r: Received) => {
    await writeInbox((await readInbox()).filter((x) => x.canonical !== r.canonical));
    if (open?.canonical === r.canonical) setOpen(null);
    load();
  };

  if (!supported) return null;
  const item = open && parse(open);

  return (
    <section className="panel p-4 space-y-3" aria-labelledby="relay-inbox-title">
      {open && item ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setOpen(null)} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" aria-hidden /> From the teacher’s screen</button>
          <div>
            <p className="text-xs text-zinc-500">{KIND[item.kind].label} · {item.course.code} · {when(item.at)}</p>
            <h2 id="relay-inbox-title" className="text-lg font-bold text-zinc-900 dark:text-white">{item.title}</h2>
            <Trust check={open.check} from={item.from} />
          </div>
          {item.kind === 'QUIZ' && item.quiz ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-white/10"><OfflineQuiz quiz={item.quiz} /></div>
          ) : (
            <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-line break-words">{item.text}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0"><ScanLine className="w-5 h-5 text-emerald-700 dark:text-emerald-300" aria-hidden /></span>
            <div className="flex-1 min-w-0">
              <h2 id="relay-inbox-title" className="font-semibold text-zinc-900 dark:text-white">From the teacher’s screen</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">When your teacher shows moving codes, scan them to get the note, announcement or quiz on this phone. No internet needed.</p>
            </div>
          </div>
          <button type="button" onClick={() => setScanning(true)} className="btn-primary"><ScanLine className="w-4 h-4" aria-hidden /> Scan from the teacher’s screen</button>
          {!!items?.length && (
            <ul className="divide-y divide-zinc-200 dark:divide-white/[0.06] -mx-1">
              {items.map((r) => {
                const it = parse(r);
                if (!it) return null;
                const K = KIND[it.kind];
                return (
                  <li key={`${r.receivedAt}:${keyOf(it)}`} className="flex items-center gap-2 py-2 px-1">
                    <button type="button" onClick={() => setOpen(r)} className="flex-1 min-w-0 text-start flex items-center gap-3">
                      <K.icon className={cn('w-5 h-5 shrink-0', it.kind === 'QUIZ' ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-indigo-600 dark:text-indigo-300')} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{it.title}</span>
                        <span className="block text-xs text-zinc-500">{K.label} · {it.course.code} · {r.check === 'ok' ? `from ${it.from}` : 'not checked'}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => void remove(r)} className="btn-ghost btn-sm text-rose-600 dark:text-rose-400" aria-label={`Remove “${it.title}”`}><Trash2 className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {scanning && <Camera onDone={(b) => void received(b)} onClose={() => setScanning(false)} />}
    </section>
  );
}
