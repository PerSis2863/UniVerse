'use client';

import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi } from 'lucide-react';
import { mutate } from 'swr';
import { toast } from 'sonner';
import { flushOutbox, listOutbox, onOutbox } from '@/lib/outbox';

/**
 * Sends the offline outbox (src/lib/outbox.ts, upgrade 4): on start, when the connection comes
 * back, and when a backed-off retry is due (one timer, never polling). Returns how many are waiting.
 */
function useOutbox() {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const items = await listOutbox().catch(() => []);
      setWaiting(items.filter((i) => !i.error).length);
      clearTimeout(timer);
      const next = Math.min(...items.filter((i) => !i.error && i.nextAt > Date.now()).map((i) => i.nextAt));
      if (Number.isFinite(next)) timer = setTimeout(() => void flushOutbox(), Math.max(1000, next - Date.now()));
    };
    const off = onOutbox((e) => {
      void refresh();
      if (e.type === 'sent' && e.item?.kind === 'quiz') { toast.success(`Sent: ${e.item.label}`); void mutate('/quizzes/student/my-quizzes'); }
      if (e.type === 'sent' && e.item?.kind === 'assignment') { toast.success(`Handed in: ${e.item.label}`); void mutate(`/api/assignments/${e.item.ref}`); }
      if (e.type === 'failed' && e.item) toast.error(`${e.item.label} wasn’t accepted: ${e.item.error}`, { description: 'See Courses → Offline.' });
    });
    const online = () => void flushOutbox();
    window.addEventListener('online', online);
    void refresh();
    void flushOutbox();
    return () => { off(); clearTimeout(timer); window.removeEventListener('online', online); };
  }, []);
  return waiting;
}

export function OfflineBar() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const [visible, setVisible] = useState(false);
  const waiting = useOutbox();

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
    } else if (wasOffline) {
      // Show the "back online" message briefly, and refetch whatever is on screen.
      setVisible(true);
      void mutate(() => true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isOnline, wasOffline]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[140] flex items-center justify-center gap-2 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-xs font-semibold transition-all duration-500 ${
        isOnline
          ? 'bg-emerald-500 text-white'
          : 'bg-orange-500 text-white'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3.5 h-3.5" />
          Back online{waiting ? ` · sending ${waiting} saved item${waiting === 1 ? '' : 's'}` : ''}
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          You&apos;re offline — pages you&apos;ve opened still work{waiting ? ` · ${waiting} waiting to send` : ''}
        </>
      )}
    </div>
  );
}
