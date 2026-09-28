'use client';

import { useEffect } from 'react';

/** Tells navigateWithTransition that the new page has painted its first frames. */
export function RouteRendered() {
  useEffect(() => {
    let a = 0, b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => window.dispatchEvent(new Event('universe:route-rendered'))); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []);
  return null;
}
