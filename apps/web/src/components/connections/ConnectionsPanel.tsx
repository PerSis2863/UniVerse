'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { formatDistanceStrict } from 'date-fns';
import { CalendarDays, ExternalLink, GraduationCap, Info, Link2, Loader2, Mail, MessageSquare, Unplug } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

// M182 / M200: connections to outside services (src/server/connections.ts). Messages shows mail and chat;
// Settings shows every kind (calendars and, for teachers, Google Classroom too).
type Kind = 'mail' | 'chat' | 'calendar' | 'classroom';
interface Service { id: string; name: string; kind: Kind; available: boolean; connected: { account: string | null; since: string } | null }
interface List { services: Service[]; elsewhere: { id: string; name: string; why: string }[] }
interface Item { id: string; title: string; sub: string; at?: string; link?: string | null }

const ICON: Record<Kind, typeof Mail> = { mail: Mail, chat: MessageSquare, calendar: CalendarDays, classroom: GraduationCap };

export function ConnectionsPanel({ kinds, back }: { kinds: Kind[]; back: string }) {
  const { data, mutate } = useSWR<List>('/api/connections', authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Back from the service: say how it went, once.
  useEffect(() => {
    const p = new URLSearchParams(location.search), done = p.get('connected');
    if (!done) return;
    const name = data?.services.find((s) => s.id === done)?.name;
    if (done === 'cancelled') toast.message('Not connected: you cancelled it.');
    else if (done === 'failed') toast.error('That didn’t connect. Try again.');
    else if (name) { toast.success(`${name} is connected.`); void Promise.resolve().then(() => setOpen(done)); }
    else return;
    p.delete('connected');
    history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
  }, [data]);

  const connect = async (s: Service) => {
    setBusy(s.id);
    try {
      const { url } = await authedJson<{ url: string }>(`/api/connections/${s.id}/start`, { method: 'POST', body: JSON.stringify({ back }) });
      location.assign(url);
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  };
  const disconnect = async (s: Service) => {
    setBusy(s.id);
    try { await authedJson(`/api/connections/${s.id}`, { method: 'DELETE' }); toast.success(`${s.name} is disconnected.`); setOpen(null); await mutate(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const services = data?.services.filter((s) => kinds.includes(s.kind)) ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Bring your other accounts in. UniVerse only reads them, shows them when you open them here and keeps nothing; disconnect any time.</p>
      {!data && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" aria-hidden /><span className="sr-only">Loading</span></div>}
      <ul className="space-y-2.5">
        {services.map((s) => {
          const Icon = ICON[s.kind];
          return (
            <li key={s.id} className="rounded-xl border border-zinc-200 dark:border-white/10 p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/[0.06] grid place-items-center shrink-0"><Icon className="w-4 h-4 text-zinc-700 dark:text-zinc-200" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{s.name}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words" translate={s.connected?.account ? 'no' : undefined}>
                    {s.connected ? `Connected${s.connected.account ? ` as ${s.connected.account}` : ''}` : s.available ? 'Not connected' : 'Not set up on UniVerse yet: the site’s owner adds it'}
                  </p>
                </div>
                {s.connected ? (
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary btn-sm" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Hide' : 'Show'}</button>
                    <button type="button" className="btn-ghost btn-sm" disabled={busy === s.id} onClick={() => void disconnect(s)}><Unplug className="w-4 h-4" aria-hidden />Disconnect</button>
                  </span>
                ) : (
                  <button type="button" className="btn-primary btn-sm" disabled={!s.available || busy === s.id} onClick={() => void connect(s)}>
                    {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Link2 className="w-4 h-4" aria-hidden />}Connect
                  </button>
                )}
              </div>
              {open === s.id && s.connected && <Items service={s} />}
            </li>
          );
        })}
      </ul>
      {kinds.includes('chat') && data && (
        <section aria-labelledby="conn-elsewhere" className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] p-3.5">
          <h3 id="conn-elsewhere" className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white"><Info className="w-4 h-4" aria-hidden />Not possible yet</h3>
          <dl className="mt-2 space-y-2">
            {data.elsewhere.map((e) => <div key={e.id}><dt className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{e.name}</dt><dd className="text-xs text-zinc-600 dark:text-zinc-400">{e.why}</dd></div>)}
          </dl>
        </section>
      )}
    </div>
  );
}

/** What a connection shows, read live from the service. */
function Items({ service }: { service: Service }) {
  const now = useNow();
  const [range] = useState(() => { const from = new Date(); return `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + 14 * 86_400_000).toISOString())}`; });
  const { data, error } = useSWR<{ mail?: { id: string; from: string; subject: string; snippet: string; at: string; link: string }[]; chats?: { id: string; with: string; last: string; at: string; link: string }[]; events?: { id: string; title: string; start: string; allDay: boolean; where: string | null; link: string | null }[]; courses?: { id: string; name: string; section: string | null; link: string | null }[] }>(`/api/connections/${service.id}/items?${range}`, authedJson, { revalidateOnFocus: false });
  const [importing, setImporting] = useState<string | null>(null);
  if (error) return <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{(error as Error).message}</p>;
  if (!data) return <div className="mt-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" aria-hidden /><span className="sr-only">Loading</span></div>;
  const when = (at: string) => (now ? formatDistanceStrict(new Date(at), now, { addSuffix: true }) : '');
  const items: Item[] = [
    ...(data.mail ?? []).map((m) => ({ id: m.id, title: m.subject, sub: `${m.from} · ${m.snippet}`, at: when(m.at), link: m.link })),
    ...(data.chats ?? []).map((c) => ({ id: c.id, title: c.with, sub: c.last, at: when(c.at), link: c.link })),
    ...(data.events ?? []).map((e) => ({ id: e.id, title: e.title, sub: `${new Date(e.start).toLocaleString(undefined, e.allDay ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${e.where ? ` · ${e.where}` : ''}`, link: e.link })),
  ];
  const doImport = async (id: string, name: string) => {
    setImporting(id);
    try {
      const r = await authedJson<{ course: { code: string }; assignments: number; students: number; enrolled: number }>(`/api/connections/classroom/import`, { method: 'POST', body: JSON.stringify({ courseId: id }) });
      toast.success(`${name} is now ${r.course.code}: ${r.assignments} assignment${r.assignments === 1 ? '' : 's'}, ${r.enrolled} of ${r.students} students enrolled. Send the others the course’s invite link.`, { duration: 9000 });
    } catch (e) { toast.error((e as Error).message); }
    finally { setImporting(null); }
  };
  if (data.courses) {
    return data.courses.length ? (
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {data.courses.map((c) => (
          <li key={c.id} className="py-2 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0 text-sm text-zinc-800 dark:text-zinc-200" translate="no">{c.name}{c.section ? ` · ${c.section}` : ''}</span>
            <button type="button" className="btn-secondary btn-sm" disabled={importing === c.id} onClick={() => void doImport(c.id, c.name)}>{importing === c.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}Import as a course</button>
          </li>
        ))}
      </ul>
    ) : <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No classes you teach in Google Classroom.</p>;
  }
  return items.length ? (
    <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/[0.06]">
      {items.map((i) => (
        <li key={i.id}>
          <a href={i.link ?? undefined} target="_blank" rel="noopener noreferrer" className={cn('py-2 flex items-start gap-2 rounded-lg', i.link && 'hover:bg-zinc-50 dark:hover:bg-white/[0.04]')}>
            <span className="min-w-0 flex-1" translate="no">
              <span className="block text-sm font-medium text-zinc-900 dark:text-white truncate">{i.title}</span>
              <span className="block text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{i.sub}</span>
            </span>
            {i.at && <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">{i.at}</span>}
            {i.link && <ExternalLink className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-1" aria-label="Opens in a new tab" />}
          </a>
        </li>
      ))}
    </ul>
  ) : <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{service.kind === 'calendar' ? 'Nothing in the next two weeks.' : 'Nothing new.'}</p>;
}
