'use client';

import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Bell, Bot, CheckCircle2, FileWarning, Gauge, Package, PhoneCall, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthNumbers } from '@/server/health-numbers';
import { card, fetcher } from './shared';

// Health numbers (Stage 5 · A9): the last 7 days in numbers, from what the app records anyway:
// which API routes fail and which are slow (the Worker's 1-in-20 sample plus every server error),
// pages people hit problems on, AI use, push notifications, call quality and the app's size.
// Reads only (src/server/health-numbers.ts).

type Route = HealthNumbers['slowest'][number];
interface BuildSize { at: string; shared: number; heaviest: { path: string; total: number }[]; over: number; pages: number }

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 1000) / 10}%`);
const ms = (x: number | null | undefined) => (x === null || x === undefined ? '–' : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${x} ms`);
const kb = (b: number) => `${Math.round(b / 102.4) / 10} KB`;
const routeName = (r: Pick<Route, 'method' | 'route'>) => `${r.method} ${r.route.replace(/^\/api/, '')}`;

function Section({ icon: Icon, title, hint, children }: { icon: typeof Gauge; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cn(card, 'p-5 min-w-0')}>
      <h2 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500 shrink-0" /> {title}</h2>
      {hint && <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> {children}</p>;

function Rows({ items }: { items: { key: string; label: string; value: string; note?: string; bad?: boolean }[] }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
      {items.map((i) => (
        <li key={i.key} className="py-2 flex items-baseline gap-3 text-sm">
          <span className="min-w-0 flex-1 break-all text-zinc-800 dark:text-zinc-200">{i.label}{i.note && <span className="block text-xs text-zinc-600 dark:text-zinc-400">{i.note}</span>}</span>
          <span className={cn('shrink-0 font-semibold tabular-nums', i.bad ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-white')}>{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function HealthNumbersPanel() {
  const { data, error } = useSWR<HealthNumbers>('/owner/health-numbers', fetcher, { revalidateOnFocus: false });
  // Written by the build (scripts/bundle-report.mjs --summary): this version's first-load JavaScript.
  const { data: size } = useSWR<BuildSize | null>('/build-size.json', (u: string) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null), { revalidateOnFocus: false });

  if (error && !data) return <p className="text-sm text-rose-600 dark:text-rose-400">The numbers couldn’t load. Try again in a minute.</p>;
  if (!data) return <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-48 rounded-3xl skeleton" />)}</div>;

  const push = data.push;
  const sent = push.ok + push.failed + push.expired;
  const aiPeak = Math.max(1, ...data.ai.perDay.map((d) => d.calls));
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        The last 7 days. API numbers come from 1 request in 20 (and every server error){data.since ? `, recorded since ${formatDistanceToNow(new Date(data.since), { addSuffix: true })}` : ': nothing recorded yet'}.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <Section icon={AlertTriangle} title="Failed most yesterday" hint="API routes that answered with a server error (5xx), yesterday (UTC).">
          {data.failedYesterday.length ? (
            <Rows items={data.failedYesterday.map((r) => ({ key: routeName(r), label: routeName(r), value: `${r.failedYesterday}×`, bad: true, note: `${r.failed} in 7 days` }))} />
          ) : <Empty>No server errors yesterday.{data.failing.length ? ` This week: ${data.failing.map(routeName).slice(0, 2).join(', ')}.` : ''}</Empty>}
        </Section>

        <Section icon={Timer} title="Slowest API routes" hint="Average time to answer, the slowest seen, and how often it took over a second.">
          {data.slowest.length ? (
            <Rows items={data.slowest.map((r) => ({ key: routeName(r), label: routeName(r), value: ms(r.avgMs), bad: (r.avgMs ?? 0) > 1000, note: `slowest ${ms(r.maxMs)} · over 1 s ${pct(r.slowShare)} · about ${r.requests.toLocaleString()} requests` }))} />
          ) : <Empty>Not enough requests recorded yet.</Empty>}
        </Section>

        <Section icon={FileWarning} title="Pages with problems" hint="Where people (browser) or the server hit errors this week; Errors has the details.">
          {data.pages.length ? (
            <Rows items={data.pages.map((p) => ({ key: `${p.source}${p.path}`, label: p.path, value: `${p.problems} problem${p.problems === 1 ? '' : 's'}`, note: `${p.source === 'CLIENT' ? 'in the browser' : 'on the server'} · ${p.times.toLocaleString()} times in all` }))} />
          ) : <Empty>No problems this week.</Empty>}
        </Section>

        <Section icon={Bot} title="AI use" hint="Requests per day for the whole site, and what people used AI help for (from their AI receipts).">
          <div className="flex items-end gap-1.5 h-20" role="img" aria-label={`AI requests per day: ${data.ai.perDay.map((d) => `${format(new Date(d.day), 'EEE')} ${d.calls}`).join(', ')}`}>
            {data.ai.perDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t bg-indigo-500/80" style={{ height: `${Math.max(3, (d.calls / aiPeak) * 64)}px` }} />
                <span className="text-[10px] text-zinc-600 dark:text-zinc-400">{format(new Date(d.day), 'EEE')}</span>
              </div>
            ))}
          </div>
          {data.ai.perFeature.length > 0 && <div className="mt-3"><Rows items={data.ai.perFeature.map((k) => ({ key: k.kind, label: k.kind.replace(/[_-]/g, ' ').toLowerCase(), value: `${k.uses}` }))} /></div>}
        </Section>

        <Section icon={Bell} title="Push notifications" hint="Delivered to phones and computers this week; expired ones were removed (the device was reset or the app removed).">
          {sent ? (
            <Rows items={[
              { key: 'ok', label: 'Delivered', value: `${push.ok.toLocaleString()} (${pct(push.ok / sent)})` },
              { key: 'failed', label: 'Failed', value: push.failed.toLocaleString(), bad: push.failed / sent > 0.05 },
              { key: 'expired', label: 'Expired devices removed', value: push.expired.toLocaleString() },
            ]} />
          ) : <Empty>No notifications sent this week (or none recorded yet).</Empty>}
        </Section>

        <Section icon={PhoneCall} title="Call quality" hint="From each person’s report at the end of a call.">
          {data.calls ? (
            <Rows items={[
              { key: 'calls', label: 'Calls', value: `${data.calls.calls.toLocaleString()} (${data.calls.people.toLocaleString()} people)` },
              { key: 'loss', label: 'Packets lost (average, worst)', value: `${pct(data.calls.avgLoss)} · ${pct(data.calls.worstLoss)}`, bad: (data.calls.avgLoss ?? 0) > 0.05 },
              { key: 'relay', label: 'Through the relay (TURN)', value: pct(data.calls.relayShare) },
              { key: 'audio', label: 'Fell back to audio only', value: pct(data.calls.audioOnlyShare) },
              { key: 'failed', label: 'Couldn’t connect or dropped', value: pct(data.calls.failedShare), bad: (data.calls.failedShare ?? 0) > 0.1 },
              { key: 'setup', label: 'Time to connect (average)', value: ms(data.calls.setupMs) },
              ...(data.calls.rating !== null ? [{ key: 'rating', label: 'Rating', value: `${data.calls.rating.toFixed(1)} / 5` }] : []),
            ]} />
          ) : <Empty>No calls this week.</Empty>}
        </Section>

        <Section icon={Package} title="App size (this version)" hint="JavaScript a page downloads before it works, compressed. Targets: 200 KB in the app, 120 KB for public pages.">
          {size ? (
            <Rows items={[
              { key: 'shared', label: 'Shared by every page', value: kb(size.shared) },
              ...size.heaviest.slice(0, 3).map((p) => ({ key: p.path, label: `Heaviest: ${p.path}`, value: kb(p.total) })),
              { key: 'over', label: 'Pages over their target', value: `${size.over} of ${size.pages}`, bad: size.over > 0, note: `Built ${formatDistanceToNow(new Date(size.at), { addSuffix: true })}` },
            ]} />
          ) : <p className="text-sm text-zinc-600 dark:text-zinc-400">Written by each build (not in local development).</p>}
        </Section>
      </div>
    </div>
  );
}
