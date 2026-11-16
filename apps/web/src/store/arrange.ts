import { create } from 'zustand';
import type { PageLayout, Pin } from '@/lib/arrange';

// M165–M167: what the arranging engine (src/lib/arrange-dom.ts, started by ArrangeMode) tells the rest
// of the app: whether the page or the side menu on screen was rearranged and how to put it back,
// whether the person's arrangements follow them to their other devices (null: not known yet), and the
// shortcuts they dragged onto the side menu or a page (by `MENU_PINS` / `pagePins(path)`).
interface ArrangeState {
  arranged: boolean;
  reset: () => void;
  /** M181: packs the page's grids with no gaps; how many it packed. */
  tidy: () => number;
  /** Anything arranged anywhere, on this device. */
  any: boolean;
  resetAll: () => void;
  sync: boolean | null;
  setSync: (on: boolean) => Promise<void>;
  pins: Record<string, Pin[]>;
  removePin: (key: string, href: string) => void;
  /** M221: a menu's saved order by its scope (`/~menu/<scope>`, the side menu's `data-arrange-scope`), read and
   *  changed by the bar across the top; `rev` grows with every change, so what reads it draws again. */
  menu: (scope: string) => PageLayout;
  setMenu: (scope: string, layout: PageLayout) => void;
  rev: number;
}
export const useArrange = create<ArrangeState>(() => ({
  arranged: false, reset: () => undefined, tidy: () => 0, any: false, resetAll: () => undefined, sync: null, setSync: async () => undefined,
  pins: {}, removePin: () => undefined, menu: () => [], setMenu: () => undefined, rev: 0,
}));
