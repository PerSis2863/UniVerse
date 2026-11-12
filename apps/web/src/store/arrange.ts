import { create } from 'zustand';

// M165: whether the page on screen was rearranged by the person, and how to put it back
// (src/lib/arrange-dom.ts does the work; the top bar shows "Put this page back" only then).
export const useArrange = create<{ arranged: boolean; reset: () => void; set: (s: { arranged: boolean; reset: () => void }) => void }>((set) => ({
  arranged: false,
  reset: () => undefined,
  set: (s) => set(s),
}));
