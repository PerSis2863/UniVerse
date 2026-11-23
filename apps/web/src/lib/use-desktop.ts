import { useSyncExternalStore } from 'react';

// A computer: a mouse (or trackpad) that hovers, and a wide screen. STORMFALL (M82) and Hyperion (M405, the owner,
// 22 Nov: "it should be available on computer only") show only there.
export const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(DESKTOP); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
/** True on a computer. `server` is the answer while rendering on the server (null: not known yet). */
export function useDesktop<T extends boolean | null = boolean>(server: T = false as T): boolean | T {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => server);
}
