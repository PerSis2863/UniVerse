'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from 'react';
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import { toast } from 'sonner';
import { Flag, Loader2, LocateOff, Navigation, Route as RouteIcon, ScanEye, Share, Volume2, VolumeX } from 'lucide-react';
import { directionsUrl, distance, duration, haversine, routesOf, spotLink, type Avoid, type Mode, type Route, type Spot } from '@/lib/map-tools';
import { bannerDistance, bearingOf, cueAt, cueText, followZoom, hasArrived, headingAt, isOff, planOf, pointAt, progressAt, snapTo, turnToward, type Progress } from '@/lib/navigation';
import { useNow } from '@/lib/use-now';
import { useWakeLock } from '@/lib/use-wake-lock';
import { cn } from '@/lib/utils';
import { navGradient } from './map-layers';
import { TurnIcon } from './TurnIcon';

// M260 (the owner, 17 Nov: "the directions part where it navigates you live … ultra smooth"): live turn-by-turn
// navigation on Travel's map, as Google Maps and Apple Maps do it. The phone's position (watchPosition; it never
// leaves the browser) is snapped to the route; the camera follows it tilted and turned to the way you're going,
// gliding between the phone's fixes on its own animation frames (MapLibre's jumpTo, no React render a frame); the
// route behind you fades to grey (a line-gradient); a banner with the next turn's arrow and the metres counting down,
// the turn after it, the arrival time with the time and distance left; spoken instructions (the browser's own
// voice, in the page's language when the page is translated), a new route when you leave this one, an arrival
// card, a Re-centre button after you move the map, the screen kept awake. The logic is in src/lib/navigation.ts.

export type NavTrip = { route: Route; mode: Mode; to: Spot; via: Spot[]; avoid: Avoid };

const MUTE = 'uv-nav-muted', PITCH: Record<Mode, number> = { foot: 45, bike: 50, car: 58 };
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const metresBetween = (a: [number, number], b: [number, number]) => haversine({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) * 1000;
const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ROUTE_LAYERS = ['uv-route-alt', 'uv-route-edge', 'uv-route-line', 'uv-route-ends', 'uv-route-time'];
const PUCK = '<svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="22" fill="#1f87ff" fill-opacity="0.16"/><circle cx="23" cy="23" r="12.5" fill="#1f87ff" stroke="#fff" stroke-width="3.5"/><path d="M23 14.5 L28.6 27.4 L23 24.4 L17.4 27.4 Z" fill="#fff"/></svg>';

/** Phones speak only after a tap has asked once: call this from the Start button's press. */
export function primeSpeech() {
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* no speech here */ }
}

type Anim = { have: boolean; onRoute: boolean; along: number; fromAlong: number; toAlong: number; pos: [number, number]; from: [number, number]; to: [number, number]; t0: number; dur: number; bearing: number; target: number; zoom: number; zoomTo: number; done: number; settled: boolean; rejoin: boolean };

export function Navigate({ mapRef, trip, dark, onEnd, onLook }: { mapRef: RefObject<MLMap | null>; trip: NavTrip; dark: boolean; onEnd: () => void; onLook: (s: Spot) => void }) {
  const [route, setRoute] = useState(trip.route);
  const [ver, setVer] = useState(0); // a new route (the banner slides in again)
  const plan = useMemo(() => planOf(route), [route]);
  const [pos, setPos] = useState<'waiting' | 'ok' | 'denied'>('waiting');
  const [prog, setProg] = useState<Progress>(() => progressAt(plan, 0));
  const [speed, setSpeed] = useState<number | null>(null);
  const [etaAt, setEtaAt] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE) === '1'; } catch { return false; } });
  const [arrived, setArrived] = useState<{ min: number; km: number } | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [list, setList] = useState(false); // the turns still to come
  const [line, setLine] = useState(''); // what was said last: for screen readers, and read back to speak it in the page's language
  const [tries, setTries] = useState(0);
  const now = useNow();
  const sayBox = useRef<HTMLParagraphElement>(null), puck = useRef<Marker | null>(null), planRef = useRef(plan), darkRef = useRef(dark);
  const anim = useRef<Anim>({ have: false, onRoute: true, along: 0, fromAlong: 0, toAlong: 0, pos: route.path[0], from: route.path[0], to: route.path[0], t0: 0, dur: 1, bearing: 0, target: 0, zoom: 17, zoomTo: 17, done: -1, settled: false, rejoin: false });
  const followRef = useRef(true), wanted = useRef(true), recentring = useRef(0), said = useRef(new Set<string>()), offCount = useRef(0), lastFix = useRef(0), lastReroute = useRef(-1e9);
  const viaLeft = useRef(trip.via), travelled = useRef(0), lastRaw = useRef<[number, number] | null>(null), startedAt = useRef(0), ask = useRef<AbortController | null>(null);
  useWakeLock(!arrived);
  useEffect(() => { planRef.current = plan; anim.current.done = -1; }, [plan]);
  useEffect(() => { darkRef.current = dark; anim.current.done = -1; }, [dark]);

  /** The route on the map (again after a new style), with the other directions layers out of the way. */
  const draw = useEffectEvent((m: MLMap) => {
    for (const id of ROUTE_LAYERS) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
    (m.getSource('uv-nav') as GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: plan.path } });
    anim.current.done = -1;
  });
  useEffect(() => { const m = mapRef.current; if (m) draw(m); }, [plan, mapRef]);

  /** Back to following you: a glide to where you are, then the camera follows again. */
  const recentre = () => {
    const m = mapRef.current, a = anim.current;
    if (!m) return;
    const token = ++recentring.current;
    wanted.current = true;
    setFollow(true);
    m.easeTo({ center: a.pos, bearing: a.bearing, zoom: a.zoom, pitch: PITCH[trip.mode], duration: calm() ? 0 : 800, easing: (t) => 1 - Math.pow(1 - t, 3) });
    m.once('moveend', () => { if (token === recentring.current) { followRef.current = true; a.settled = false; } });
  };

  // The map made ready: the route, your arrow, room above it (you sit low on the screen, the road ahead above), and
  // following stopped when you move the map yourself. All put back on leaving.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    let gone = false;
    const restyle = () => draw(m);
    m.on('style.load', restyle);
    draw(m);
    const pad = () => { const c = m.getContainer(); m.setPadding({ top: Math.round(c.clientHeight * 0.42), bottom: 96, left: 0, right: 0 }); };
    pad();
    window.addEventListener('resize', pad);
    // A finger or the mouse on the map pauses the camera at once (moving it every frame would cancel the drag); if the
    // map is then moved, following stops and Re-centre shows; a plain tap lets it carry on.
    const box = m.getCanvasContainer();
    let moved = false;
    const down = () => { moved = false; followRef.current = false; };
    const up = () => { if (!moved && wanted.current) followRef.current = true; };
    const yours = (e: { originalEvent?: unknown }) => { if (e.originalEvent) { moved = true; wanted.current = false; followRef.current = false; recentring.current++; setFollow(false); } };
    const kinds = ['movestart', 'zoomstart', 'rotatestart', 'pitchstart'] as const;
    for (const k of kinds) m.on(k, yours);
    box.addEventListener('pointerdown', down);
    box.addEventListener('wheel', down, { passive: true });
    window.addEventListener('pointerup', up);
    const el = document.createElement('div');
    el.className = 'rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.3)]';
    el.innerHTML = PUCK;
    void import('maplibre-gl').then((ml) => { if (!gone) puck.current = new ml.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(anim.current.pos).addTo(m); });
    // Until the phone answers: the start of the route, tilted the way it sets off.
    const p0 = planRef.current;
    m.easeTo({ center: p0.path[0], bearing: headingAt(p0, 0), pitch: PITCH[trip.mode], zoom: followZoom(trip.mode, null, 1000), duration: calm() ? 0 : 1200 });
    return () => {
      gone = true;
      m.off('style.load', restyle);
      window.removeEventListener('resize', pad);
      for (const k of kinds) m.off(k, yours);
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('wheel', down);
      window.removeEventListener('pointerup', up);
      puck.current?.remove(); puck.current = null;
      ask.current?.abort();
      try { speechSynthesis.cancel(); } catch { /* no speech */ }
      if (m.getStyle()) {
        for (const id of ROUTE_LAYERS) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'visible');
        (m.getSource('uv-nav') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
        m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
        m.easeTo({ pitch: 0, bearing: 0, duration: calm() ? 0 : 600 });
      }
    };
  }, [mapRef, trip.mode]);

  // The camera, your arrow and the travelled line, every frame while something moves (outside React): between two
  // fixes the arrow glides along the route (around corners, not across them), the bearing and the zoom ease.
  useEffect(() => {
    let raf = 0, last = performance.now();
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const a = anim.current, m = mapRef.current, dt = Math.min(100, t - last);
      last = t;
      if (!a.have || !m) return;
      const k = a.dur ? Math.min(1, (t - a.t0) / a.dur) : 1, still = calm();
      const turn = ((a.target - a.bearing + 540) % 360) - 180, zoomGap = a.zoomTo - a.zoom;
      if (k >= 1 && Math.abs(turn) < 0.05 && Math.abs(zoomGap) < 0.002 && a.settled) return; // resting: nothing to draw
      a.settled = k >= 1;
      if (a.onRoute) { a.along = a.fromAlong + (a.toAlong - a.fromAlong) * k; a.pos = pointAt(planRef.current, a.along); }
      else a.pos = [a.from[0] + (a.to[0] - a.from[0]) * k, a.from[1] + (a.to[1] - a.from[1]) * k];
      if (!a.onRoute && a.rejoin && k >= 1) { a.onRoute = true; a.rejoin = false; } // glided onto the route: along it from here
      a.bearing = still ? a.target : turnToward(a.bearing, a.target, 1 - Math.exp(-dt / 300));
      a.zoom = still ? a.zoomTo : a.zoom + zoomGap * (1 - Math.exp(-dt / 700));
      puck.current?.setLngLat(a.pos).setRotation(a.bearing);
      if (followRef.current) m.jumpTo({ center: a.pos, bearing: a.bearing, zoom: a.zoom, pitch: PITCH[trip.mode] });
      const done = a.along / Math.max(1, planRef.current.total);
      if (Math.abs(done - a.done) * planRef.current.total > 0.5 && m.getLayer('uv-nav-line')) {
        m.setPaintProperty('uv-nav-line', 'line-gradient', navGradient(done, darkRef.current, false));
        m.setPaintProperty('uv-nav-edge', 'line-gradient', navGradient(done, darkRef.current, true));
        a.done = done;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mapRef, trip.mode]);

  /** Say a line: shown to screen readers, then spoken (unless muted) as the page shows it: translated, in the page's language. */
  const say = useEffectEvent((text: string) => {
    setLine(text);
    if (muted || typeof speechSynthesis === 'undefined') return;
    setTimeout(() => {
      const shown = sayBox.current?.textContent?.trim() || text;
      try {
        const u = new SpeechSynthesisUtterance(shown);
        u.lang = shown !== text ? document.documentElement.lang || 'en' : 'en';
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch { /* no speech here */ }
    }, 150);
  });

  /** Off the route for a while: a new one from where you are (through the stops not yet reached). */
  const reroute = useEffectEvent((p: { lat: number; lon: number }, t: number) => {
    lastReroute.current = t;
    setRerouting(true);
    say('Finding a new route');
    const passed = plan.steps.filter((s) => s.type === 'stop' && s.along <= anim.current.along).length;
    viaLeft.current = viaLeft.current.slice(passed);
    ask.current?.abort();
    const ctl = new AbortController(); ask.current = ctl;
    fetch(directionsUrl(trip.mode, p, trip.to, { via: viaLeft.current, avoid: trip.avoid }), { signal: ctl.signal })
      .then((r) => r.json()).then((answer) => {
        const r = routesOf(answer)[0];
        if (!r) throw new Error('no route');
        const a = anim.current;
        said.current = new Set(); offCount.current = 0;
        // Glide from where the arrow is to the new route's start, then follow it.
        Object.assign(a, { onRoute: false, rejoin: true, from: a.pos, to: r.path[0], t0: performance.now(), dur: calm() ? 0 : 600, along: 0, fromAlong: 0, toAlong: 0, settled: false });
        setRoute(r); setVer((v) => v + 1);
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') toast.error('Couldn’t find a new route just now: it will try again in a moment.'); })
      .finally(() => { if (!ctl.signal.aborted) setRerouting(false); });
  });

  const arrive = useEffectEvent(() => {
    setArrived({ min: Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)), km: travelled.current / 1000 });
    say('You have arrived at your destination');
    setList(false);
  });

  /** A fix from the phone: where you are on the route, what's left, what to say, and where the arrow glides to next. */
  const onFix = useEffectEvent((g: GeolocationPosition) => {
    if (arrived) return;
    const t = performance.now(), c = g.coords, p = { lat: c.latitude, lon: c.longitude }, raw: [number, number] = [c.longitude, c.latitude], a = anim.current;
    setPos('ok');
    if (!startedAt.current) startedAt.current = Date.now();
    const s = snapTo(plan, p, a.toAlong - 40), away = isOff(s.off, c.accuracy, trip.mode);
    offCount.current = away ? offCount.current + 1 : 0;
    const prev = lastRaw.current, gap = prev ? metresBetween(prev, raw) : 0;
    const v = c.speed != null && c.speed >= 0 ? c.speed : prev && lastFix.current ? gap / Math.max(0.2, (t - lastFix.current) / 1000) : null;
    const dur = calm() ? 0 : Math.max(250, Math.min(1600, lastFix.current ? t - lastFix.current : 1000));
    lastFix.current = t; lastRaw.current = raw; travelled.current += Math.min(200, gap);
    const near = !away && s.off < 40, pr = progressAt(plan, s.along);
    if (!a.have) {
      // The first fix: the arrow appears there and the camera glides to it.
      Object.assign(a, { have: true, onRoute: near, along: s.along, fromAlong: s.along, toAlong: s.along, pos: near ? s.at : raw, from: near ? s.at : raw, to: near ? s.at : raw, bearing: near ? headingAt(plan, s.along) : c.heading ?? 0, zoom: followZoom(trip.mode, v, pr.toNext) });
      a.target = a.bearing; a.zoomTo = a.zoom;
      followRef.current = false;
      recentre();
    } else if (near && a.onRoute) {
      Object.assign(a, { fromAlong: a.along, toAlong: s.along, target: headingAt(plan, s.along) });
    } else if (near) {
      // Back on the route: glide onto it, then along it from the next fix.
      Object.assign(a, { onRoute: false, rejoin: true, from: a.pos, to: s.at, along: s.along, fromAlong: s.along, toAlong: s.along, target: headingAt(plan, s.along) });
    } else {
      const heading = c.heading != null && Number.isFinite(c.heading) && (v ?? 0) > 1 ? c.heading : prev && gap > 3 ? bearingOf(prev, raw) : a.target;
      Object.assign(a, { onRoute: false, rejoin: false, from: a.pos, to: raw, target: heading });
    }
    Object.assign(a, { t0: t, dur, settled: false, zoomTo: followZoom(trip.mode, v, pr.toNext) });
    setProg(pr); setSpeed(v); setEtaAt(Date.now() + pr.leftSec * 1000);
    if (hasArrived(pr, s.off, trip.mode)) { arrive(); return; }
    if (offCount.current >= 3 && !rerouting && t - lastReroute.current > 10_000) { reroute(p, t); return; }
    if (away || rerouting) return;
    const cue = cueAt(trip.mode, pr, said.current);
    if (cue) { said.current.add(cue.key); say(cueText(plan, pr, cue.kind)); }
  });
  const onFail = useEffectEvent((e: GeolocationPositionError) => { if (e.code === e.PERMISSION_DENIED) setPos('denied'); });

  // Your position, as often as the phone has it (it stays in this browser); stopped on arrival.
  const done = !!arrived;
  useEffect(() => {
    if (done) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { void Promise.resolve().then(() => setPos('denied')); return; }
    const id = navigator.geolocation.watchPosition((g) => onFix(g), (e) => onFail(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 30_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [done, tries]);

  const overview = () => {
    const m = mapRef.current;
    if (!m) return;
    followRef.current = false; wanted.current = false; recentring.current++; setFollow(false);
    const rest = plan.path.filter((_, i) => plan.cum[i] >= anim.current.along - 1).concat([anim.current.pos]);
    const xs = rest.map((q) => q[0]), ys = rest.map((q) => q[1]), c = m.getContainer();
    m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: c.clientWidth >= 640 ? 60 : 150, bottom: 130, left: c.clientWidth >= 640 ? 430 : 40, right: 70 }, bearing: 0, pitch: 0, duration: calm() ? 0 : 900, maxZoom: 17 });
    m.once('moveend', () => m.setPadding({ top: Math.round(c.clientHeight * 0.42), bottom: 96, left: 0, right: 0 }));
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { localStorage.setItem(MUTE, next ? '1' : '0'); if (next) speechSynthesis.cancel(); } catch { /* private mode, or no speech */ }
  };
  const arrivalAt = etaAt ?? (now ? now + plan.sec * 1000 : null);
  const shareEta = async () => {
    const text = `On my way to ${trip.to.name}${arrivalAt ? `: arriving about ${hm(arrivalAt)}` : ''}.`, url = spotLink(location.origin, trip.to, 16);
    try {
      if (navigator.share) await navigator.share({ title: 'My arrival time', text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast.success('Arrival time copied'); }
    } catch { /* closed the share sheet */ }
  };

  const step = plan.steps[prog.next], then = plan.steps[prog.next + 1], along = plan.total - prog.leftM;
  const showThen = !!then && step.type !== 'arrive' && then.along - step.along < 1000;
  const btn = 'flex h-11 w-11 items-center justify-center text-zinc-800 transition-[transform,background-color] duration-150 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/[0.08]';
  const kmh = speed != null ? Math.round(speed * 3.6) : null;
  return (
    <>
      <p ref={sayBox} className="sr-only" aria-live="assertive">{line}</p>
      {!arrived && (
        <div className="absolute inset-x-2 top-2 z-40 sm:inset-x-auto sm:start-3 sm:top-3 sm:w-[24rem]" role="region" aria-label="Next turn">
          <div className="overflow-hidden rounded-[1.375rem] bg-[#15171c] text-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
            {pos === 'denied' ? (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <LocateOff className="h-8 w-8 shrink-0 text-white/80" aria-hidden />
                <p className="min-w-0 flex-1 text-[15px] leading-snug">Turn on location for this site to be guided.</p>
                <button type="button" onClick={() => { setPos('waiting'); setTries((n) => n + 1); }} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-900">Try again</button>
              </div>
            ) : pos === 'waiting' || rerouting ? (
              <div className="flex items-center gap-3 px-4 py-4">
                <Loader2 className="h-7 w-7 shrink-0 animate-spin text-white/80" aria-hidden />
                <p className="text-[17px] font-medium">{rerouting ? 'Finding a new route…' : 'Finding where you are…'}</p>
              </div>
            ) : (
              <div key={`${ver}:${prog.next}`} className="swap flex items-center gap-3.5 px-4 py-3.5" data-dir="next">
                <TurnIcon type={step.type} mod={step.mod} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[28px] font-semibold leading-none tabular-nums">{bannerDistance(prog.toNext)}</p>
                  <p className="mt-1.5 line-clamp-2 text-[17px] font-medium leading-snug text-white/90">{step.text}</p>
                </div>
              </div>
            )}
            {showThen && pos === 'ok' && !rerouting && (
              <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white/85">
                <span className="font-medium">Then</span><TurnIcon type={then.type} mod={then.mod} className="h-5 w-5 shrink-0" /><span className="truncate">{then.text}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {!arrived && (
        <div className="absolute end-3 top-[9.5rem] z-40 flex flex-col overflow-hidden rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 divide-y divide-zinc-200 sm:top-3 dark:bg-[#1f232b]/95 dark:ring-white/10 dark:divide-white/10">
          <button type="button" className={btn} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Turn the voice on' : 'Mute the voice'}>{muted ? <VolumeX className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}</button>
          <button type="button" className={btn} onClick={overview} aria-label="See the whole route"><RouteIcon className="h-5 w-5" aria-hidden /></button>
          <button type="button" className={btn} onClick={() => void shareEta()} aria-label="Share my arrival time"><Share className="h-5 w-5" aria-hidden /></button>
        </div>
      )}
      {!arrived && trip.mode === 'car' && kmh != null && (
        <div className="absolute bottom-[6.75rem] start-3 z-40 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg ring-1 ring-black/5 dark:bg-[#1f232b] dark:text-white dark:ring-white/10" role="status" aria-label={`${kmh} km/h`}>
          <span className="text-xl font-semibold leading-none tabular-nums">{kmh}</span><span className="text-[11px] text-zinc-500 dark:text-zinc-400">km/h</span>
        </div>
      )}
      {!follow && !arrived && (
        <button type="button" onClick={() => recentre()} className="absolute bottom-[6.75rem] start-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#0b55c4] shadow-lg ring-1 ring-black/5 animate-[layers-in_180ms_var(--ease-out-soft)] motion-reduce:animate-none rtl:translate-x-1/2 dark:bg-[#1f232b] dark:text-[#8cc0ff] dark:ring-white/10">
          <Navigation className="h-4 w-4" aria-hidden />Re-centre
        </button>
      )}
      <div className="absolute inset-x-2 bottom-2 z-40 sm:inset-x-auto sm:start-1/2 sm:w-[30rem] sm:-translate-x-1/2 rtl:sm:translate-x-1/2">
        <div className="overflow-hidden rounded-[1.375rem] bg-[var(--card-bg)] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/[0.06] dark:ring-white/10">
          {arrived ? (
            <div className="px-4 pb-4 pt-5 text-center animate-[layers-in_220ms_var(--ease-out-soft)] motion-reduce:animate-none" role="status">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><Flag className="h-6 w-6" aria-hidden /></span>
              <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-white">You have arrived</h3>
              <p className="text-sm text-zinc-700 dark:text-zinc-200" translate="no">{trip.to.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{duration(arrived.min)} · {distance(arrived.km)} travelled</p>
              <div className="mt-3 flex justify-center gap-2">
                <button type="button" onClick={() => onLook(trip.to)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><ScanEye className="h-4 w-4" aria-hidden />Look around</button>
                <button type="button" onClick={onEnd} className="btn-primary btn-sm">Done</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 py-2.5 pe-2.5 ps-4">
                <button type="button" onClick={() => setList((o) => !o)} aria-expanded={list} aria-controls="nav-turns" className="min-w-0 flex-1 text-start">
                  <span className="block text-[22px] font-semibold leading-tight tabular-nums text-zinc-900 dark:text-white">{arrivalAt ? hm(arrivalAt) : '–'}<span className="ms-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">arrival</span></span>
                  <span className="block text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{duration(Math.max(1, Math.round(prog.leftSec / 60)))} · {distance(prog.leftM / 1000)}<span className="ms-1.5 text-xs text-zinc-500 dark:text-zinc-400">{list ? 'Hide the turns' : 'See the turns'}</span></span>
                </button>
                <button type="button" onClick={onEnd} className="h-11 shrink-0 rounded-full bg-[#d93025] px-5 text-[15px] font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-[#c5221f]">End</button>
              </div>
              {list && (
                <ol id="nav-turns" className="max-h-[38vh] overflow-y-auto border-t border-zinc-200/70 px-4 dark:border-white/10">
                  {plan.steps.slice(prog.next).map((s, i) => (
                    <li key={i} className={cn('flex items-center gap-3 py-2.5 text-sm', i && 'border-t border-zinc-200/60 dark:border-white/[0.06]')}>
                      <TurnIcon type={s.type} mod={s.mod} className="h-5 w-5 shrink-0 text-zinc-700 dark:text-zinc-200" />
                      <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-100">{s.text}</span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{bannerDistance(Math.max(0, s.along - along))}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
