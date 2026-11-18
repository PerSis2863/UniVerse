'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2 } from 'lucide-react';
import { dataPage } from '@/lib/data-page';
import { authedFetch } from '@/lib/authed-fetch';

/** "Download my data": saves a JSON file of everything that belongs to you on UniVerse. */
export function DownloadMyData() {
  const [busy, setBusy] = useState(false);
  const run = async (readable = false) => {
    setBusy(true);
    try {
      const res = await authedFetch('/api/core/users/me/export');
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Download failed');
      // M302: or as one web page anyone can open (made here in the browser from the same file).
      const blob = readable ? new Blob([dataPage(await res.json())], { type: 'text/html;charset=utf-8' }) : await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `universe-my-data-${new Date().toISOString().slice(0, 10)}.${readable ? 'html' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Your data is downloading', { description: readable ? 'A web page: open it in any browser.' : 'A JSON file you can open with any text editor or import elsewhere.' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/[0.05] rounded-xl">
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="font-medium text-zinc-900 dark:text-white text-sm">Download my data</h3>
        <p className="text-xs text-zinc-500 mt-0.5">A copy of your profile, grades, messages you sent, posts, boards, trips, Green and Relief records and more: a JSON file, or a page to read.</p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void run(true)} disabled={busy} className="btn-ghost px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-60"><FileText className="w-4 h-4" aria-hidden /> Readable copy</button>
        <button type="button" onClick={() => void run()} aria-busy={busy || undefined} disabled={busy} className="btn-secondary px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
        </button>
      </div>
    </div>
  );
}
