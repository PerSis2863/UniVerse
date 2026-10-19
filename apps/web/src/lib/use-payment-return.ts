'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { authedJson } from './authed-fetch';

// Back from a gateway's payment page (?paid=<order id>&session_id=… or ?canceled=<order id>):
// the server asks the gateway whether it was paid (src/server/payments/provider.ts), once, and the
// address is tidied so a reload doesn't ask again.
export function usePaymentReturn(onPaid: (out: Record<string, unknown>) => void) {
  const done = useRef(false);
  const cb = useRef(onPaid);
  useEffect(() => { cb.current = onPaid; });
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const url = new URL(window.location.href);
    const paid = url.searchParams.get('paid'), canceled = url.searchParams.get('canceled');
    if (!paid && !canceled) return;
    for (const k of ['paid', 'canceled', 'session_id']) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (canceled) { toast('Payment cancelled. Nothing was charged.'); return; }
    void authedJson<Record<string, unknown>>('/api/payments/verify', { method: 'POST', body: JSON.stringify({ orderId: paid }) })
      .then((out) => { toast.success('Payment received. Thank you!'); cb.current(out); })
      .catch((e) => toast.error((e as Error).message));
  }, []);
}
