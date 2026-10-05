'use client';

import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Maximize2, X } from 'lucide-react';
import { QrCode } from '@/components/ui/QrCode';
import { authedJson } from '@/lib/authed-fetch';
import { spring } from '@/lib/motion';

/**
 * Full-screen check-in QR code that changes every 30 seconds (campus events, volunteer shifts).
 * `endpoint` returns { code, expiresIn }; the QR opens `path?checkin=<code>` on the student's phone.
 * It reloads just before each window ends, so a photo of it stops working almost straight away.
 */
export function RotatingQr({ endpoint, path, title, onClose }: { endpoint: string; path: string; title: string; onClose: () => void }) {
  const [code, setCode] = useState<{ code: string; expiresIn: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const load = () => authedJson<{ code: string; expiresIn: number }>(endpoint)
      .then((c) => { if (!alive) return; setCode(c); setError(null); timer = setTimeout(load, Math.max(1, c.expiresIn) * 1000 + 200); })
      .catch((e: Error) => { if (!alive) return; setError(e.message); timer = setTimeout(load, 5000); });
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [endpoint]);
  const url = code ? `${window.location.origin}${path}?checkin=${encodeURIComponent(code.code)}` : '';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring.smooth} className="fixed inset-0 z-[150] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center" role="dialog" aria-modal="true" aria-label={`Check-in code for ${title}`}>
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" aria-label="Close"><X className="w-6 h-6" /></button>
      <h2 className="text-2xl font-black text-zinc-900 dark:text-white">{title}</h2>
      <p className="text-zinc-500 mt-1 inline-flex items-center gap-1"><Maximize2 className="w-4 h-4" /> Scan with your phone camera to check in</p>
      <div className="mt-6 rounded-3xl bg-white p-4 shadow-xl">
        {code ? <motion.div key={code.code} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={spring.snappy}><QrCode value={url} size={320} title="Check-in QR code" /></motion.div> : <div className="w-80 h-80 skeleton rounded-2xl" />}
      </div>
      <p className="mt-4 text-sm text-zinc-500">{error ?? 'The code changes every 30 seconds, so photos of it stop working.'}</p>
    </motion.div>
  );
}
