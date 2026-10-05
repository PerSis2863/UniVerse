import { create } from 'zustand';

// The calls this tab is in (src/components/call/CallHost.tsx), like a phone: one active call, others
// on hold. The active one is full screen or minimised to a floating bar while you use the app.

interface Entry { id: string; kind?: 'audio' | 'video' }
interface CallsStore {
  calls: Entry[];
  active: string | null;
  minimized: boolean;
  /** Each call's hang-up, so "End & answer" can end the current call. */
  enders: Record<string, () => void>;
  /** Opens (or returns to) a call; any other call goes on hold. */
  open: (id: string, kind?: 'audio' | 'video') => void;
  minimize: () => void;
  close: (id: string) => void;
  setEnder: (id: string, end: (() => void) | null) => void;
}

export const useCalls = create<CallsStore>((set) => ({
  calls: [],
  active: null,
  minimized: false,
  enders: {},
  open: (id, kind) => set((s) => ({ calls: s.calls.some((c) => c.id === id) ? s.calls : [...s.calls, { id, kind }], active: id, minimized: false })),
  minimize: () => set({ minimized: true }),
  close: (id) => set((s) => {
    const calls = s.calls.filter((c) => c.id !== id);
    const { [id]: _gone, ...enders } = s.enders; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { calls, enders, active: s.active === id ? calls[calls.length - 1]?.id ?? null : s.active, minimized: s.active === id && calls.length ? true : s.minimized };
  }),
  setEnder: (id, end) => set((s) => {
    const { [id]: _old, ...rest } = s.enders; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { enders: end ? { ...rest, [id]: end } : rest };
  }),
}));
