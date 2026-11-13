'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { LiveCard } from '@/components/live/LiveCard';
import { Radar, type Blip } from '@/components/live/Radar';
import { Tracks } from '@/components/live/Tracks';
import { Heartbeat } from '@/components/live/Heartbeat';
import { PulseGrid } from '@/components/live/PulseGrid';
import { fmt } from '@/lib/instruments';
import type { Pulse } from '@/server/pulse';

// The owner console's live cards (M49): who is here now on a radar, everyone by role as a
// role rows (Overview; M171, the constellation before), and the app's heartbeat with a pulse grid of activity (the live board).
// From what the console already loads.

const ROLE_NAME: Record<string, string> = { STUDENT: 'Students', TEACHER: 'Teachers', ADMIN: 'Admins', IT_SUPPORT: 'IT support', OWNER: 'Owner', PARENT: 'Parents', GUARDIAN: 'Guardians' };
const RING: Record<string, Blip['ring']> = { OWNER: 0, ADMIN: 0, IT_SUPPORT: 0, TEACHER: 1 };

export function PeopleNow({ online, signIns, newUsers, recent }: {
  online: { id: string; name: string; role: string; lastSeenAt: string }[];
  signIns: number;
  newUsers: number;
  recent: { id: string; createdAt: string; city: string | null; device: string | null; user: { name: string } }[];
}) {
  const blips: Blip[] = online.map((u) => ({ id: u.id, label: u.name.split(' ')[0], ring: RING[u.role] ?? 2, tone: u.role === 'TEACHER' ? 'blue' : RING[u.role] === 0 ? 'aqua' : 'pink' }));
  return (
    <LiveCard title="Who’s here now" sub="Admins in the middle, teachers next, everyone else outside"
      stats={[{ label: 'Online', value: fmt(online.length) }, { label: 'Sign-ins today', value: fmt(signIns) }, { label: 'New this week', value: fmt(newUsers) }]}
      ticker={recent.slice(0, 6).map((s) => `${s.user.name} signed in ${formatDistanceToNowStrict(new Date(s.createdAt), { addSuffix: true })}${s.city ? ` · ${s.city}` : ''}${s.device ? ` · ${s.device}` : ''}`)}>
      {blips.length ? <Radar blips={blips} label={`${online.length} people online now`} className="mx-auto h-[260px] max-w-[320px]" />
        : <p className="py-20 text-center text-sm text-white/70">Nobody else is online right now.</p>}
    </LiveCard>
  );
}

export function Everyone({ roles }: { roles: Record<string, number> }) {
  const groups = Object.entries(roles).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = groups.reduce((a, [, n]) => a + n, 0);
  return (
    <LiveCard title="Everyone" sub="Every account, by role" stats={[{ label: 'Accounts', value: fmt(total) }]}>
      <Tracks label="Every account by role" tracks={groups.map(([r, n]) => ({
        key: r, label: ROLE_NAME[r] ?? r, value: fmt(n), parts: [{ n, tone: 'pink' as const, label: 'Accounts' }],
        detail: `${total ? Math.round((n / total) * 100) : 0}% of all accounts`,
      }))} />
    </LiveCard>
  );
}

/** Requests as a heartbeat (server errors as red sparks) and a pulse grid of what people did. */
export function Heartbeats({ p, per }: { p: Pulse; per: string }) {
  const now = p.requests.at(-1) ?? 0;
  const failed = p.errors.server.reduce((a, b) => a + b, 0);
  return (
    <LiveCard title="The app’s heartbeat" sub={`Requests per second this ${per}, failures as red sparks`}
      stats={[{ label: 'Now', value: `${fmt(now, 2)} req/s` }, { label: 'Online', value: fmt(p.online.now) }, { label: 'Failed', value: fmt(failed) }]}>
      <div className="h-[150px]"><Heartbeat values={p.requests} marks={p.errors.server} label={`Requests per second this ${per}`} /></div>
      <PulseGrid className="mt-4 h-[72px]" label={`Page views, messages and sign-ins this ${per}`}
        rows={[{ label: 'Views', values: p.activity.views }, { label: 'Messages', values: p.activity.messages, tone: 'blue' }, { label: 'Sign-ins', values: p.signIns.signIns, tone: 'aqua' }]} />
    </LiveCard>
  );
}
