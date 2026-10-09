'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { authedJson } from '@/lib/authed-fetch';
import { errorMessage } from '@/lib/api';
import { fadeUp, list } from '@/lib/motion';

// "Message a parent" for teachers (Stage 5 · B16.2): a student's linked parents; picking one opens
// the parent–teacher chat in the teacher's inbox (src/server/parent-messages.ts).

interface Parents { allowed: boolean; student: { id: string; name: string }; parents: { id: string; name: string; avatar: string | null; relation: string | null }[] }

export function MessageParentSheet({ studentId, studentName, inbox, onClose }: { studentId: string; studentName: string; inbox: string; onClose: () => void }) {
  const router = useRouter();
  const { data, error } = useSWR<Parents>(`/api/teacher/parents?studentId=${encodeURIComponent(studentId)}`, authedJson);
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (guardianId: string) => {
    setBusy(guardianId);
    try {
      const r = await authedJson<{ conversationId: string }>('/api/teacher/parents', { method: 'POST', body: JSON.stringify({ studentId, guardianId }) });
      router.push(`${inbox}?c=${r.conversationId}`);
    } catch (e) { toast.error(errorMessage(e, 'Couldn’t open the chat.')); setBusy(null); }
  };
  return (
    <Sheet title={`${studentName.split(' ')[0]}’s parents`} onClose={onClose}>
      {error ? <p className="text-sm text-rose-500">{errorMessage(error, 'Couldn’t load the parents.')}</p>
        : !data ? <ContentSkeleton variant="list" />
        : !data.allowed ? <p className="text-sm text-zinc-500">Your school hasn’t turned on parent messages.</p>
        : data.parents.length === 0 ? (
          <div className="text-center py-6">
            <Users className="w-9 h-9 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="font-semibold text-zinc-900 dark:text-white">No parent accounts linked yet</p>
            <p className="text-sm text-zinc-500 mt-1">{studentName.split(' ')[0]} can link a parent in Settings → Parent or guardian.</p>
          </div>
        ) : (
          <motion.ul variants={list} initial="hidden" animate="show" className="space-y-1">
            {data.parents.map((p) => (
              <motion.li key={p.id} variants={fadeUp}>
                <button type="button" disabled={!!busy} onClick={() => void open(p.id)} className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.05] disabled:opacity-60">
                  <Avatar name={p.name} src={p.avatar} size={40} />
                  <span className="flex-1 min-w-0"><span className="block font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span><span className="block text-xs text-zinc-500">{p.relation ?? 'Parent or guardian'}</span></span>
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      <p className="mt-4 text-[11px] text-zinc-500">The chat opens in your Messages. Parents see your hours for parents (Settings → Notifications); outside them, their messages wait without a notification.</p>
    </Sheet>
  );
}
