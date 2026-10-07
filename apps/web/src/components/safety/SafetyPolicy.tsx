'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Baby, Loader2, Moon, ShieldCheck, Video } from 'lucide-react';
import Link from '@/components/ui/Link';
import { Switch } from '@/components/ui/Switch';
import { authedJson } from '@/lib/authed-fetch';

// Admin → Safety → Policy (Stage 4 · 4.10; src/server/safety.ts): how the school keeps young
// students safe. Each switch saves at once.

interface Policy { guard: boolean; recordMinors: boolean; quietMinors: boolean; quietStart: string; quietEnd: string; studentsMinors: boolean; open: number; ai: boolean }

function Row({ icon: Icon, tint, title, desc, children }: { icon: typeof Moon; tint: string; title: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 p-4">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: tint }}><Icon className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-zinc-900 dark:text-white">{title}</p>
        <div className="text-sm text-zinc-500 mt-0.5">{desc}</div>
      </div>
      <div className="shrink-0 pt-1">{children}</div>
    </div>
  );
}

export function SafetyPolicy() {
  const { data, error, mutate } = useSWR<Policy>('/api/safety/policy', authedJson);
  const [times, setTimes] = useState<{ quietStart?: string; quietEnd?: string }>({});

  const save = async (change: Partial<Policy>, done: string) => {
    if (!data) return;
    void mutate({ ...data, ...change }, { revalidate: false });
    try {
      const p = await authedJson<Omit<Policy, 'open' | 'ai'>>('/api/safety/policy', { method: 'POST', body: JSON.stringify(change) });
      void mutate({ ...data, ...p }, { revalidate: false });
      toast.success(done);
    } catch (e) { void mutate(data, { revalidate: false }); toast.error((e as Error).message); }
  };
  const saveTime = (k: 'quietStart' | 'quietEnd') => {
    const v = times[k];
    if (!data || !v || v === data[k]) return;
    void save({ [k]: v }, `Quiet hours now ${k === 'quietStart' ? v : data.quietStart}–${k === 'quietEnd' ? v : data.quietEnd}`);
  };

  if (error) return <div className="flex-1 p-4 md:p-8"><p className="text-sm text-rose-500 max-w-3xl mx-auto">{(error as Error).message}</p></div>;
  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-4">
        {!data ? (
          <div className="h-80 rounded-2xl skeleton" />
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl divide-y divide-zinc-200/80 dark:divide-white/[0.06]">
              <Row icon={ShieldCheck} tint="#34c759" title="Chat safety check" desc={<>
                Every message in a chat with a student is checked for bullying, threats, someone at risk, grooming, risky personal details and hate. Ones that may need a look go to <Link href="/admin/safety/chats" className="text-indigo-600 dark:text-indigo-300 font-medium">Chat safety</Link>{data.open ? ` (${data.open} to review)` : ''}, for admins only.
                {' '}{data.ai ? 'Unclear messages are checked by AI.' : 'AI is off, so only the clearest danger signs (self-harm, threats) are flagged.'}
              </>}>
                <Switch checked={data.guard} label="Chat safety check" onChange={(v) => void save({ guard: v }, v ? 'Chat safety check on' : 'Chat safety check off')} />
              </Row>
              <Row icon={Video} tint="#ff3b30" title="Record calls with students under 18" desc={data.recordMinors ? 'On: teachers can record calls and classes with students under 18 in them. Everyone sees the REC badge.' : 'Off: a recording can’t start while a student under 18 is in the call, and stops if one joins (what came before is kept).'}>
                <Switch checked={data.recordMinors} label="Record calls with students under 18" onChange={(v) => void save({ recordMinors: v }, v ? 'Calls with students under 18 can be recorded' : 'Calls with students under 18 can’t be recorded')} />
              </Row>
              <Row icon={Moon} tint="#5856d6" title="Quiet hours for students under 18" desc={<>
                No notifications to their phones or computers during these hours (messages and calls still arrive in the app). They can’t turn them off; older students and staff set their own in Settings.
                {data.quietMinors && (
                  <span className="mt-2.5 flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                    <label className="inline-flex items-center gap-1.5">From <input type="time" value={times.quietStart ?? data.quietStart} onChange={(e) => setTimes((t) => ({ ...t, quietStart: e.target.value }))} onBlur={() => saveTime('quietStart')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1 text-sm" /></label>
                    <label className="inline-flex items-center gap-1.5">to <input type="time" value={times.quietEnd ?? data.quietEnd} onChange={(e) => setTimes((t) => ({ ...t, quietEnd: e.target.value }))} onBlur={() => saveTime('quietEnd')} className="rounded-lg bg-zinc-100 dark:bg-white/[0.07] px-2 py-1 text-sm" /></label>
                  </span>
                )}
              </>}>
                <Switch checked={data.quietMinors} label="Quiet hours for students under 18" onChange={(v) => void save({ quietMinors: v }, v ? 'Quiet hours on for students under 18' : 'Quiet hours off for students under 18')} />
              </Row>
              <Row icon={Baby} tint="#ff9500" title="Students without a birth date are under 18" desc="Turn on for a school; leave off for a university or college. A student with a birth date on their profile always counts by it.">
                <Switch checked={data.studentsMinors} label="Students without a birth date are under 18" onChange={(v) => void save({ studentsMinors: v }, v ? 'Students without a birth date count as under 18' : 'Only birth dates decide who is under 18')} />
              </Row>
            </div>
            <p className="text-xs text-zinc-500 px-1">Guardians who get a student’s shared link see how active they were this week (days, messages, calls, work handed in), never what they wrote or who to.</p>
          </>
        )}
        {!data && !error && <Loader2 className="w-4 h-4 animate-spin text-zinc-400 mx-auto" />}
      </div>
    </div>
  );
}
