import { create } from 'zustand';

// M165–M166: what the arranging engine (src/lib/arrange-dom.ts, started by ArrangeMode) tells the rest
// of the app: whether the page or the side menu on screen was rearranged and how to put it back, and
// whether the person's arrangements follow them to their other devices (null: not known yet).
interface ArrangeState {
  arranged: boolean;
  reset: () => void;
  /** Anything arranged anywhere, on this device. */
  any: boolean;
  resetAll: () => void;
  sync: boolean | null;
  setSync: (on: boolean) => Promise<void>;
}
export const useArrange = create<ArrangeState>(() => ({
  arranged: false, reset: () => undefined, any: false, resetAll: () => undefined, sync: null, setSync: async () => undefined,
}));
