'use client';

import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { Rocket } from 'lucide-react';
import { InstrumentBoard, type InstrumentCell } from '@/components/instruments/Board';
import { Facts, Ring } from '@/components/instruments/parts';
import { APPS, type AppId } from '@/lib/apps';
import type { LaunchApp } from '@/lib/launch';
import { fetcher, heavy } from './shared';

// The Launch board (M26): who really uses each app in the last 30 days, without the sample world
// (GET /owner/launch, src/server/owner-launch.ts). The aim: the first 10 real people who come back.

interface Launch { apps: Record<AppId, LaunchApp>; signUps: number; total: { people: number; cameBack: number } }

const WHAT: Record<AppId, string> = { campus: 'enrolled or handed in', trace: 'scanned or joined a brand', relief: 'posted or helped', green: 'logged an action', play: 'finished a game' };

export function LaunchBoard() {
  const { data } = useSWR<Launch>('/owner/launch', fetcher, heavy);
  if (!data) return null;
  const pct = data.signUps ? Math.round((data.total.people / data.signUps) * 100) : 0;
  const cells: InstrumentCell[] = [
    { id: 'goal', label: 'Real people who came back', value: data.total.cameBack, unit: 'of 10', note: `${data.total.people} did something · ${data.signUps} new accounts`,
      body: <Ring pct={Math.min(100, data.total.cameBack * 10)} label="goal" /> },
    { id: 'acted', label: 'New accounts that did something', value: pct, unit: '%', note: 'Signed up, then used an app',
      body: <Facts rows={[['New accounts', String(data.signUps)], ['Did something', String(data.total.people)], ['Came back another day', String(data.total.cameBack)]]} /> },
    ...APPS.map((a): InstrumentCell => {
      const s = data.apps[a.id];
      return {
        id: a.id, label: a.name, value: s.people, unit: 'people', note: `${WHAT[a.id]} · ${s.newThisWeek} new this week`,
        body: <Facts rows={[['Came back another day', String(s.cameBack)], ['Last real action', s.last ? formatDistanceToNow(new Date(s.last), { addSuffix: true }) : 'none yet']]} />,
      };
    }),
  ];
  return <InstrumentBoard icon={Rocket} title="Launch" subtitle="real people only, last 30 days · sample data left out" cells={cells} live={false} storageKey="console-launch" />;
}
