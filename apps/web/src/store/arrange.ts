import { create } from 'zustand';

/** M165: whether "Arrange this page" is on (the top bar's button, the bar at the foot, Escape). */
export const useArrange = create<{ on: boolean; set: (on: boolean) => void }>()((set) => ({ on: false, set: (on) => set({ on }) }));
