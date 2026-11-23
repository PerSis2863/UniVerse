'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';

// M429: "Report" under one of Ghidra's answers (wrong, unsafe, unkind): the question and the answer go to the owner
// console's Moderation (POST /ghidra/report), so Ghidra's rules can be adjusted over time. Nothing else is sent.
export function ReportAnswer({ question, answer }: { question: string; answer: string }) {
  const [sent, setSent] = useState(false);
  const send = async () => {
    try {
      await api.post('/ghidra/report', { question: question.slice(0, 1000), answer: answer.slice(0, 6000) });
      setSent(true);
      toast.success('Thanks. Your question and this answer went to UniVerse’s team, to make Ghidra better.');
    } catch (err) { toast.error(errorMessage(err, 'Couldn’t send the report.')); }
  };
  return sent
    ? <span className="mt-2 inline-flex min-h-6 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><Flag className="w-3 h-3" aria-hidden />Reported</span>
    : <button type="button" onClick={() => void send()} className="mt-2 inline-flex min-h-6 items-center gap-1 text-xs text-zinc-600 hover:underline dark:text-zinc-300"><Flag className="w-3 h-3" aria-hidden />Report this answer</button>;
}
