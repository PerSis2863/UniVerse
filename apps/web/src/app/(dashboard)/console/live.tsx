'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Heartbeats } from './live-cards';
import { format } from 'date-fns';
import { Gauge } from 'lucide-react';
import { useActivePoll } from '@/lib/realtime-client';
import { change, fmt, percentileBin, stats } from '@/lib/instruments';
import type { Pulse, PulseRange } from '@/server/pulse';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Dial, Facts, HeatStrip, Histo, Hourglass, Meter, Mirror, Ring, Spark, Stack } from '@/components/instruments/parts';
import { fetcher } from './shared';

// The console's live board (the owner's "Instrumental" reference, 24 Oct 2026): nine cells from
// GET /owner/pulse (src/server/pulse.ts), refreshed every 30 seconds while the page is open. Tap a
// cell to open it: the line, a limit to drag, and the numbers for the period.

const RANGES: { id: PulseRange; label: string }[] = [{ id: '1h', label: '1 h' }, { id: '24h', label: '1 day' }, { id: '7d', label: '7 days' }];
const RANGE_KEY = 'uv-console-live-range';

function labelsFor(p: Pulse): string[] {
  const end = new Date(p.at).getTime();
  return Array.from({ length: p.requests.length }, (_, i) => {
    const back = (p.requests.length - 1 - i) * p.step;
    if (i === p.requests.length - 1) return 'now';
    if (p.range === '1h') return `-${Math.round(back / 60)} min`;
    const t = new Date(end - back * 1000);
    return p.range === '24h' ? format(t, 'HH:mm') : format(t, 'EEE HH:mm');
  });
}

export function LiveBoard() {
  const [range, setRange] = useState<PulseRange>(() => {
    try { const r = localStorage.getItem(RANGE_KEY); if (r === '1h' || r === '24h' || r === '7d') return r; } catch { /* private mode */ }
    return '24h';
  });
  const pick = (r: PulseRange) => { setRange(r); try { localStorage.setItem(RANGE_KEY, r); } catch { /* private mode */ } };
  const { data: p } = useSWR<Pulse>(`/owner/pulse?range=${range}`, fetcher, { refreshInterval: useActivePoll(30_000), keepPreviousData: true, revalidateOnFocus: false });
  if (!p) return <div className="ins-board"><div className="ins-board-inner h-[420px] skeleton" /></div>;

  const labels = labelsFor(p);
  const per = range === '1h' ? 'hour' : range === '24h' ? 'day' : 'week';
  const req = stats(p.requests);
  const reqChange = change(p.requestsTotal, p.requestsBefore);
  const p95Bin = percentileBin(p.latency.bins);
  const p95 = p95Bin < 0 ? 0 : (p95Bin + 1) * p.latency.binMs;
  const server = p.errors.server.reduce((a, b) => a + b, 0);
  const errPct = p.requestsTotal ? (server / p.requestsTotal) * 100 : 0;
  const msgs = p.activity.messages.reduce((a, b) => a + b, 0);
  const signIns = p.signIns.signIns.reduce((a, b) => a + b, 0);
  const waiting = p.waiting.apps + p.waiting.deletions + p.waiting.errors;
  const aiLeft = p.ai && p.ai.limit ? Math.max(0, 100 - (p.ai.used / p.ai.limit) * 100) : 100;
  const planPct = p.plan ? (p.plan.used / p.plan.limit) * 100 : 0;
  const cells: InstrumentCell[] = [
    {
      id: 'requests', label: 'Requests', value: Math.round(req.last * 100) / 100, unit: 'req/s',
      note: reqChange === null ? `${fmt(p.requestsTotal)} this ${per}` : `${reqChange >= 0 ? '↑' : '↓'} ${fmt(Math.abs(reqChange), 1)} % on the ${per} before`,
      body: <Spark values={p.requests} />,
      detail: { title: 'Requests per second', description: 'Everything the app answers, every page and route (from a 1-in-20 sample).', series: p.requests, labels, extra: [['Total', fmt(p.requestsTotal)]] },
    },
    {
      id: 'latency', label: 'Response time p95', value: p95, unit: 'ms',
      note: `half answer within ${fmt(((percentileBin(p.latency.bins, 0.5) + 1) || 0) * p.latency.binMs)} ms`,
      body: <Histo bins={p.latency.bins} marker={p95Bin} label="p95" />,
      detail: { title: 'Response time', description: 'Average time to answer in each slice, in milliseconds.', series: p.latency.perSlice.map((v) => v ?? 0), labels, threshold: 1000 },
    },
    {
      id: 'errors', label: 'Server errors', value: Math.round(errPct * 100) / 100, digits: 2, unit: '%',
      note: `${fmt(server)} failed · ${fmt(p.waiting.errors)} open`,
      body: <HeatStrip rows={[{ label: '4xx', values: p.errors.client.slice(-30) }, { label: '5xx', values: p.errors.server.slice(-30) }, { label: 'app', values: p.errors.app.slice(-30) }]} foot={[labels[labels.length - 30] ?? labels[0], 'now']} />,
      detail: { title: 'Errors', description: 'Server errors (5xx) in each slice; refused requests (4xx) and app crashes are in the strip.', series: p.errors.server, labels, threshold: 5, extra: [['Refused (4xx)', fmt(p.errors.client.reduce((a, b) => a + b, 0))], ['App crashes', fmt(p.errors.app.reduce((a, b) => a + b, 0))]] },
    },
    {
      id: 'online', label: 'Online now', value: p.online.now, unit: 'people',
      note: `${fmt(p.online.today)} today · ${fmt(p.online.people)} accounts`,
      body: <Dial value={p.online.now} max={Math.max(10, p.online.today)} />,
      detail: { title: 'App opens', description: 'Times people opened the app while signed in.', series: p.signIns.opens, labels },
    },
    {
      id: 'activity', label: 'Messages', value: msgs, unit: `this ${per}`,
      note: `${fmt(p.activity.views.reduce((a, b) => a + b, 0))} page views`,
      body: <Stack a={p.activity.messages} b={p.activity.views} />,
      detail: { title: 'Messages', description: 'Chat messages sent in each slice (page views are the lighter bars on the cell).', series: p.activity.messages, labels },
    },
    {
      id: 'waiting', label: 'Waiting for you', value: waiting, unit: 'to do', warn: waiting > 0,
      body: (
        <span className="flex items-center gap-4">
          <Hourglass fill={Math.min(1, waiting / 20)} running={waiting > 0} />
          <Facts rows={[['Approvals', fmt(p.waiting.apps)], ['Deletion requests', fmt(p.waiting.deletions)], ['Open errors', fmt(p.waiting.errors)], ['Fixed today', fmt(p.waiting.resolvedToday)]]} />
        </span>
      ),
    },
    {
      id: 'ai', label: 'AI today', value: p.ai?.used ?? 0, unit: p.ai ? `of ${fmt(p.ai.limit)} calls` : 'calls',
      body: (
        <span className="flex items-center gap-4">
          <span className="flex-1"><Facts rows={[['Used', fmt(p.ai?.used ?? 0)], ['Left', fmt(Math.max(0, (p.ai?.limit ?? 0) - (p.ai?.used ?? 0)))], ['Daily limit', fmt(p.ai?.limit ?? 0)]]} /></span>
          <Ring pct={Math.round(aiLeft * 10) / 10} label="left" size={104} />
        </span>
      ),
    },
    {
      id: 'signins', label: 'Sign-ins', value: signIns, unit: `this ${per}`,
      note: '↑ sign-ins · ↓ app opens',
      body: <Mirror up={p.signIns.signIns} down={p.signIns.opens} />,
      detail: { title: 'Sign-ins', description: 'People signing in or signing up in each slice.', series: p.signIns.signIns, labels },
    },
    {
      id: 'plan', label: p.plan ? `Plan · ${p.plan.label}` : 'Plan', value: Math.round(planPct), unit: '% used', warn: planPct >= 85,
      note: p.plan ? `${fmt(p.plan.used)} of ${fmt(p.plan.limit)} this month` : 'Not measured yet',
      body: <Meter pct={planPct} />,
    },
  ];
  return (
    <div className="space-y-6">
      <Heartbeats p={p} per={per} />
      <InstrumentBoard icon={Gauge} title="UniVerse live" subtitle={`production · ${fmt(p.online.people)} accounts · updated ${format(new Date(p.at), 'HH:mm:ss')}`} cells={cells} ranges={RANGES} range={range} onRange={pick} storageKey="console-live" />
    </div>
  );
}
