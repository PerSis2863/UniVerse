import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Low-data mode, for slow or expensive connections: photos load only when tapped, background
// refreshes happen less often and nothing refreshes just because the tab was switched back to.
// Saved on this device. `suggested` remembers that we already offered it once.
interface LowDataStore {
  enabled: boolean;
  suggestedAt: number | null;
  setEnabled: (v: boolean) => void;
  markSuggested: () => void;
}

export const useLowData = create<LowDataStore>()(
  persist(
    (set) => ({
      enabled: false,
      suggestedAt: null,
      setEnabled: (enabled) => {
        set({ enabled });
        if (typeof document !== 'undefined') document.documentElement.classList.toggle('low-data', enabled);
      },
      markSuggested: () => set({ suggestedAt: Date.now() }),
    }),
    { name: 'universe-low-data' },
  ),
);

/** Low-data mode is on (outside React). */
export const lowDataOn = () => useLowData.getState().enabled;

/** The browser says the connection is slow or data-saving is on. */
export function connectionIsSlow(): boolean {
  if (typeof navigator === 'undefined') return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}
