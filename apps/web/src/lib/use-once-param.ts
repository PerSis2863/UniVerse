'use client';

import { useEffect, useRef } from 'react';

/**
 * Runs `run` once if the page's address has `?name=…` (e.g. ?new=chat from the phone's "+" menu),
 * then takes the parameter out of the address, so a refresh doesn't do it again. Read just after
 * the first render: arriving with router.push, the address changes a moment after the page renders.
 */
export function useOnceParam(name: string, run: (value: string) => void) {
  const latest = useRef(run);
  useEffect(() => { latest.current = run; });
  useEffect(() => {
    const t = setTimeout(() => {
      const u = new URL(window.location.href);
      const v = u.searchParams.get(name);
      if (v == null) return;
      u.searchParams.delete(name);
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
      latest.current(v);
    }, 0);
    return () => clearTimeout(t);
  }, [name]);
}
