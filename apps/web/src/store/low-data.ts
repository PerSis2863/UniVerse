import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Low-data mode, for slow or expensive connections: photos load only when tapped, background
// refreshes happen less often and nothing refreshes just because the tab was switched back to.
// Saved on this device. `suggested` remembers that we already offered it once.
// 2G mode (Stage 4 · 4.11) goes further, for the weakest connections: calls are voice only at
// 16 kbps (about 7 MB an hour), no cameras are sent or received, and low-data mode is on too.
interface LowDataStore {
  enabled: boolean;
  twoG: boolean;
  suggestedAt: number | null;
  setEnabled: (v: boolean) => void;
  setTwoG: (v: boolean) => void;
  markSuggested: () => void;
}

export const useLowData = create<LowDataStore>()(
  persist(
    (set) => ({
      enabled: false,
      twoG: false,
      suggestedAt: null,
      // Turning low-data mode off turns 2G mode off too (2G is low-data and more).
      setEnabled: (enabled) => {
        set(enabled ? { enabled } : { enabled, twoG: false });
        if (typeof document !== 'undefined') document.documentElement.classList.toggle('low-data', enabled);
      },
      setTwoG: (twoG) => {
        set(twoG ? { twoG, enabled: true } : { twoG });
        if (twoG && typeof document !== 'undefined') document.documentElement.classList.add('low-data');
      },
      markSuggested: () => set({ suggestedAt: Date.now() }),
    }),
    { name: 'universe-low-data' },
  ),
);

/** Low-data mode is on (outside React). */
export const lowDataOn = () => useLowData.getState().enabled;

/** 2G mode is on (outside React). */
export const twoGOn = () => useLowData.getState().twoG;

/** Audio bitrates for calls: 2G mode (or someone in 2G mode on the other end) and normal. */
export const AUDIO_2G_BPS = 16_000;
export const AUDIO_BPS = 64_000;

/** The browser reports a 2G connection (not just data saver). */
export function connectionIs2G(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return !!c && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/** The browser says the connection is slow or data-saving is on. */
export function connectionIsSlow(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}
