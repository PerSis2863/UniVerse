'use client';

import useSWR from 'swr';
import { m as motion } from 'framer-motion';
import { HandHeart, Inbox } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Link from '@/components/ui/Link';
import { PostCard, type ReliefPost } from '@/components/relief/ReliefApp';
import { fetcher } from '@/lib/fetcher';
import { useNow } from '@/lib/use-now';

// UniVerse Relief → mine: what I asked for or offered, and the needs I'm helping with (src/server/relief.ts).

const STATUS: Record<string, string> = { OPEN: 'Waiting', TAKEN: 'Someone’s helping', DONE: 'Delivered', CLOSED: 'Closed' };

export default function ReliefMinePage() {
  const now = useNow();
  const { data, mutate } = useSWR<{ mine: ReliefPost[]; helping: ReliefPost[]; helped: number }>('/relief/mine', fetcher);
  const list = (rows: ReliefPost[], empty: string) => (
    !data ? <div className="panel h-32 skeleton" /> : rows.length === 0 ? <p className="panel p-6 text-sm text-zinc-500 text-center">{empty}</p> : (
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="panel p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{STATUS[p.status] ?? p.status}</p>
            <PostCard p={p} now={now} here={null} onChange={() => void mutate()} />
          </motion.div>
        ))}
      </div>
    )
  );
  return (
    <>
      <Topbar title="My requests & tasks" subtitle={data ? `You’ve helped ${data.helped} ${data.helped === 1 ? 'person' : 'people'}` : 'What you asked for and who you’re helping'} />
      <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          <section aria-labelledby="helping-h">
            <h2 id="helping-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><HandHeart className="w-5 h-5 text-orange-500" aria-hidden />I’m helping</h2>
            <div className="mt-3">{list(data?.helping ?? [], 'You aren’t helping with anything yet. The live map shows the most urgent needs first.')}</div>
          </section>
          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Inbox className="w-5 h-5 text-orange-500" aria-hidden />My posts</h2>
            <div className="mt-3">{list(data?.mine ?? [], 'Nothing posted yet.')}</div>
          </section>
          <Link href="/relief" className="btn-primary inline-flex">Open the live map</Link>
        </div>
      </div>
    </>
  );
}
