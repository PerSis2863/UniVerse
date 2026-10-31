'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { clearPhotos, photosFor } from '@/lib/share-in';
import type { SendPayload } from './Composer';

/** Photos shared into UniVerse from another app (src/lib/share-in.ts), waiting above this chat's box
 *  until Send (several go as one album). Keyed on the chat by its parent. */
export function SharedPhotos({ chat, onSend, blocked }: { chat: string; onSend: (p: SendPayload) => Promise<void>; blocked?: string }) {
  const [shown, setShown] = useState<{ files: File[]; urls: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true, urls: string[] = [];
    void photosFor(chat).then((files) => {
      if (!live || !files.length) return;
      urls = files.map((f) => URL.createObjectURL(f));
      setShown({ files, urls });
    });
    return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [chat]);

  if (!shown) return null;
  const n = shown.files.length;
  const drop = () => { clearPhotos(); setShown(null); };
  const send = async () => {
    setBusy(true);
    try {
      await onSend(n > 1 ? { album: shown.files.slice(0, 10) } : { file: shown.files[0] });
      drop();
    } catch { /* the chat said why; the photos stay for another try */ } finally { setBusy(false); }
  };

  return (
    <div role="region" aria-label="Shared photos" className="rise-in flex items-center gap-3 px-4 py-2.5 border-t border-zinc-200 dark:border-white/10 bg-fuchsia-500/[0.06]">
      <ul className="flex -space-x-3 rtl:space-x-reverse shrink-0">
        {shown.urls.slice(0, 4).map((u, i) => (
          <li key={u}><img src={u} alt={`Shared photo ${i + 1}`} className="w-11 h-11 rounded-xl object-cover ring-2 ring-white dark:ring-[#1d2650]" /></li>
        ))}
      </ul>
      <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-white truncate">{blocked ?? (n === 1 ? '1 photo' : `${n} photos`)}</p>
      <button type="button" onClick={drop} disabled={busy} className="btn-ghost btn-sm shrink-0">Not now</button>
      {!blocked && <button type="button" onClick={() => void send()} disabled={busy} className="btn-primary btn-sm shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}Send</button>}
    </div>
  );
}
