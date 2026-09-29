'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/** "Download my data": saves a JSON file of everything that belongs to you on UniVerse. */
export function DownloadMyData() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await authedFetch('/api/core/users/me/export');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `universe-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Your data is downloading', { description: 'A JSON file you can open with any text editor or import elsewhere.' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] rounded-xl">
      <div>
        <h3 className="font-medium text-zinc-900 dark:text-white text-sm">Download my data</h3>
        <p className="text-xs text-zinc-500 mt-0.5">A copy of your profile, grades, messages you sent, posts, boards and more, as a JSON file.</p>
      </div>
      <button onClick={run} disabled={busy} className="btn-secondary px-3 py-2 text-sm inline-flex items-center gap-2 shrink-0 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
      </button>
    </div>
  );
}
