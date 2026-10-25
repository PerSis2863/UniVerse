'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { Bluetooth, BluetoothOff, Check, Loader2, MapPin, Navigation, PackageCheck, Radio, SearchX, Square, Store, Thermometer, Warehouse } from 'lucide-react';
import { LogoMark } from '@/components/ui/LogoMark';
import { usePathParams } from '@/hooks/usePathParams';
import { api, errorMessage } from '@/lib/api';
import { useTick } from '@/lib/use-now';
import { bluetoothAvailable, connectThermometer, type Reading } from '@/lib/ble-thermometer';
import { cn } from '@/lib/utils';

// The driver's page (UniVerse Trace tracking): open the link the brand sent, tap Start sharing, and
// the batch's position goes to the brand's live tracking map every ~10 s while this page is open
// (the screen is kept awake when the phone allows it). At each stop, one tap says where you are;
// "In the shop" marks the batch delivered. No sign-in; the link works only for this one batch.

interface Info { label: string; product: string; status: string; destPlace: string | null; brand: string; color: string | null; lastPingAt: string | null; maxTempC: number | null }
interface Fix { lat: number; lng: number; speed: number | null; heading: number | null; accuracy: number; at: number }

const EVERY_MS = 10_000;
const STOPS = [
  { stage: 'WAREHOUSE', label: 'At a warehouse', icon: Warehouse },
  { stage: 'DISTRIBUTOR', label: 'With the distributor', icon: Navigation },
  { stage: 'SHOP', label: 'In the shop (delivered)', icon: Store },
] as const;

export default function View() {
  const key = usePathParams('/carry/[key]')?.key;
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [sent, setSent] = useState<{ count: number; at: number | null; error: string | null }>({ count: 0, at: null, error: null });
  const [denied, setDenied] = useState(false);
  const [place, setPlace] = useState('');
  const [arriving, setArriving] = useState<string | null>(null);
  const tick = useTick(sharing);
  const watch = useRef<number | null>(null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);
  const lastSent = useRef(0);
  const latest = useRef<Fix | null>(null);
  const [temp, setTemp] = useState('');
  const tempRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api.get<Info>(`/trace/carry/${key}`)
      .then((r) => { if (!cancelled) setInfo(r.data); })
      .catch((e) => { if (!cancelled) setMissing(errorMessage(e, 'This sharing link no longer works.')); });
    return () => { cancelled = true; };
  }, [key]);

  const send = useCallback(async (f: Fix) => {
    if (!key) return;
    lastSent.current = Date.now();
    try {
      await api.post(`/trace/carry/${key}/ping`, { lat: f.lat, lng: f.lng, speedKmh: f.speed !== null ? Math.round(f.speed * 3.6 * 10) / 10 : undefined, heading: f.heading ?? undefined, accuracyM: Math.round(f.accuracy), tempC: tempRef.current });
      setSent((s) => ({ count: s.count + 1, at: Date.now(), error: null }));
    } catch (e) { setSent((s) => ({ ...s, error: errorMessage(e, 'No connection. It tries again in a moment.') })); }
  }, [key]);

  const stop = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void lock.current?.release().catch(() => {});
    lock.current = null;
    setSharing(false);
  };

  const start = async () => {
    if (!('geolocation' in navigator)) { toast.error('This phone can’t share its position.'); return; }
    setDenied(false);
    setSharing(true);
    try { lock.current = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* the screen may sleep; sharing pauses until it's back */ }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed, heading: p.coords.heading, accuracy: p.coords.accuracy, at: p.timestamp };
        latest.current = f;
        setFix(f);
        if (Date.now() - lastSent.current >= EVERY_MS) void send(f);
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) { setDenied(true); stop(); } },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
  };

  // A phone standing still sends no new positions: repeat the last one so the brand sees it's alive.
  useEffect(() => {
    if (!sharing) return;
    const t = setInterval(() => { if (latest.current && Date.now() - lastSent.current >= EVERY_MS * 3) void send(latest.current); }, EVERY_MS);
    return () => clearInterval(t);
  }, [sharing, send]);

  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); void lock.current?.release().catch(() => {}); }, []);

  const arrive = async (stage: string) => {
    if (!key) return;
    setArriving(stage);
    try {
      await api.post(`/trace/carry/${key}/arrive`, { stage, place: place.trim() || undefined, lat: latest.current?.lat, lng: latest.current?.lng });
      toast.success(stage === 'SHOP' ? 'Delivered. Thank you!' : 'Stop recorded.');
      setPlace('');
      if (stage === 'SHOP') { stop(); setInfo((i) => (i ? { ...i, status: 'DELIVERED' } : i)); }
    } catch (e) { toast.error(errorMessage(e, 'Could not record it.')); } finally { setArriving(null); }
  };

  if (missing) {
    return (
      <Shell>
        <div className="text-center py-10">
          <SearchX className="w-10 h-10 mx-auto text-pink-300" aria-hidden />
          <h1 className="mt-4 text-2xl font-black">Link not found</h1>
          <p className="mt-2 text-zinc-300">{missing}</p>
        </div>
      </Shell>
    );
  }
  if (!info) return <Shell><div className="py-24 grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-pink-400" aria-label="Loading" /></div></Shell>;

  const delivered = info.status === 'DELIVERED';
  const ago = sent.at ? Math.max(0, Math.round((tick - sent.at) / 1000)) : null;

  return (
    <Shell>
      <p className="passport-pill inline-block">{info.brand}</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight leading-tight">{info.product}</h1>
      <p className="mt-1 text-zinc-300">{info.label}{info.destPlace ? ` → ${info.destPlace}` : ''}</p>

      <AnimatePresence mode="wait">
        {delivered ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-3xl bg-emerald-500/10 ring-1 ring-emerald-400/30 p-6 text-center">
            <PackageCheck className="w-10 h-10 mx-auto text-emerald-300" aria-hidden />
            <p className="mt-3 text-xl font-bold">Delivered</p>
            <p className="mt-1 text-sm text-zinc-300">This batch has arrived. You can close this page.</p>
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Radar */}
            <div className="relative mt-8 mx-auto w-56 h-56 grid place-items-center" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn('absolute inset-0 rounded-full border border-pink-400/40', sharing && 'carry-wave')} style={{ animationDelay: `${i * 0.8}s` }} />
              ))}
              <span className="absolute inset-8 rounded-full bg-pink-500/10" />
              <span className={cn('relative w-24 h-24 rounded-full grid place-items-center transition-all duration-500', sharing ? 'bg-pink-500 shadow-[0_0_60px_rgba(236,72,153,0.7)]' : 'bg-white/10')}>
                <Radio className="w-10 h-10" />
              </span>
            </div>

            <div className="mt-6 text-center" aria-live="polite">
              {sharing ? (
                <>
                  <p className="text-lg font-bold">Sharing where it is</p>
                  <p className="mt-1 font-mono text-sm text-zinc-300">
                    {fix ? `${fix.speed !== null ? `${Math.round(fix.speed * 3.6)} km/h · ` : ''}±${Math.round(fix.accuracy)} m` : 'Finding your position…'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{sent.count ? `${sent.count} position${sent.count === 1 ? '' : 's'} sent · last ${ago ?? 0} s ago` : 'Sending the first position…'}</p>
                  {sent.error && <p className="mt-2 text-xs text-amber-300">{sent.error}</p>}
                  <p className="mt-3 text-xs text-zinc-400">Keep this page open while you drive.</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold">Ready when you are</p>
                  <p className="mt-1 text-sm text-zinc-300">{info.brand} sees where this batch is on their map while this page is open. Nothing else on your phone is shared.</p>
                  {denied && <p className="mt-3 text-sm text-amber-300">Your phone said no to sharing the position. Allow location for this site in the browser settings, then try again.</p>}
                </>
              )}
            </div>

            <div className="mt-6">
              {sharing
                ? <button type="button" onClick={stop} className="w-full h-14 rounded-2xl bg-white/10 hover:bg-white/15 font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition"><Square className="w-4 h-4" />Stop sharing</button>
                : <button type="button" onClick={() => void start()} className="w-full h-14 rounded-2xl bg-pink-500 hover:bg-pink-400 font-bold text-white inline-flex items-center justify-center gap-2 shadow-[0_16px_40px_-14px_rgba(236,72,153,0.9)] active:scale-[0.98] transition"><Navigation className="w-5 h-5" />Start sharing</button>}
            </div>

            {info.maxTempC !== null && key && (
              <ColdChain shipKey={key} limit={info.maxTempC} temp={temp} onTemp={(v) => { setTemp(v); const n = Number(v.replace(',', '.')); tempRef.current = v.trim() && Number.isFinite(n) ? n : undefined; }} />
            )}

            <section className="mt-8 rounded-3xl bg-white/[0.05] ring-1 ring-white/10 p-5" aria-labelledby="stop-h">
              <h2 id="stop-h" className="font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-300" aria-hidden />Arrived somewhere?</h2>
              <label className="mt-3 block text-xs text-zinc-300">Place (optional)
                <input value={place} maxLength={160} onChange={(e) => setPlace(e.target.value)} placeholder="Lyon warehouse" className="mt-1 w-full h-11 rounded-xl bg-white/10 px-3 text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-pink-400" />
              </label>
              <div className="mt-3 grid gap-2">
                {STOPS.map((s) => (
                  <button key={s.stage} type="button" onClick={() => void arrive(s.stage)} disabled={!!arriving}
                    className={cn('h-12 rounded-xl px-4 text-left font-semibold inline-flex items-center gap-3 active:scale-[0.98] transition', s.stage === 'SHOP' ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25' : 'bg-white/[0.07] hover:bg-white/[0.12]')}>
                    {arriving === s.stage ? <Loader2 className="w-4 h-4 animate-spin" /> : <s.icon className="w-4 h-4" aria-hidden />}{s.label}
                    {s.stage === 'SHOP' && <Check className="ml-auto w-4 h-4 opacity-60" aria-hidden />}
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh trace-hero text-white">
      <div className="mx-auto max-w-md px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-8"><LogoMark className="w-6 h-6" />UniVerse Trace</div>
        {children}
      </div>
    </main>
  );
}

/**
 * The cold chain on the driver's page: pair a Bluetooth thermometer (its readings go straight to the
 * brand, at most one every 30 seconds, through /trace/carry/<key>/reading), or type the temperature
 * (it goes with each position).
 */
function ColdChain({ shipKey, limit, temp, onTemp }: { shipKey: string; limit: number; temp: string; onTemp: (v: string) => void }) {
  const [sensor, setSensor] = useState<{ name: string; stop: () => void } | null>(null);
  const [live, setLive] = useState<Reading | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [canPair] = useState(bluetoothAvailable);
  const lastSent = useRef(0);
  useEffect(() => () => sensor?.stop(), [sensor]);

  const pair = async () => {
    setConnecting(true);
    try {
      const s = await connectThermometer((r) => {
        setLive(r);
        if (Date.now() - lastSent.current < 30_000) return;
        lastSent.current = Date.now();
        void api.post(`/trace/carry/${shipKey}/reading`, { tempC: r.tempC, humidity: r.humidity ?? undefined, source: 'BLE', device: s.name }).catch(() => {});
      }, () => { setSensor(null); toast('The thermometer disconnected. Pair it again when it’s back in range.'); });
      setSensor(s);
      toast.success(`Connected to ${s.name}`);
    } catch (e) {
      // Closing the browser's chooser isn't an error worth showing.
      if ((e as { name?: string }).name !== 'NotFoundError') toast.error(errorMessage(e, 'Couldn’t connect to the thermometer.'));
    } finally { setConnecting(false); }
  };

  const warm = (live ? live.tempC : Number(temp.replace(',', '.'))) > limit;
  return (
    <section className={cn('mt-4 rounded-2xl bg-white/[0.05] ring-1 p-4', warm ? 'ring-amber-400/70' : 'ring-white/10')} aria-labelledby="cold-h">
      <h2 id="cold-h" className="flex items-center gap-2 text-sm font-semibold"><Thermometer className="w-4 h-4 text-sky-300" aria-hidden />Temperature in the truck</h2>
      <p className="mt-0.5 text-xs text-zinc-400">Keep it at {limit} °C or colder. {warm ? 'It’s too warm: the brand has been told.' : ''}</p>
      {sensor && live ? (
        <p className="mt-3 flex items-baseline gap-2" aria-live="polite">
          <span className={cn('font-mono text-4xl tabular-nums', warm ? 'text-amber-300' : 'text-white')}>{live.tempC.toFixed(1)}°</span>
          {live.humidity !== null && <span className="font-mono text-sm text-zinc-400">{Math.round(live.humidity)}% humidity</span>}
          <span className="ms-auto text-[11px] text-zinc-400">from {sensor.name}</span>
        </p>
      ) : (
        <input inputMode="decimal" value={temp} onChange={(e) => onTemp(e.target.value)} aria-label="Temperature in °C" placeholder={`${limit - 2}`} className={cn('mt-2 w-full h-11 rounded-xl bg-white/10 px-3 text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-pink-400', warm && 'ring-2 ring-amber-400')} />
      )}
      {canPair ? (
        sensor ? (
          <button type="button" onClick={() => { sensor.stop(); setSensor(null); setLive(null); }} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 text-sm font-semibold"><BluetoothOff className="w-4 h-4" />Disconnect the thermometer</button>
        ) : (
          <button type="button" onClick={() => void pair()} disabled={connecting} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 px-3 py-2 text-sm font-semibold text-sky-100 disabled:opacity-60">{connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}Connect a Bluetooth thermometer</button>
        )
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">A Bluetooth thermometer can send readings by itself from Chrome on Android or a computer.</p>
      )}
    </section>
  );
}
