'use client';

// Display preferences from Settings → Appearance and Accessibility, kept on this device and applied
// before the first paint (the inline script in app/layout.tsx), so nothing jumps after loading.

export type TextSize = 'default' | 'large' | 'larger';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

export const textSize = (): TextSize => (get('uv-text') === 'large' || get('uv-text') === 'larger' ? (get('uv-text') as TextSize) : 'default');
export function setTextSize(v: TextSize) {
  set('uv-text', v === 'default' ? null : v);
  if (v === 'default') delete document.documentElement.dataset.text; else document.documentElement.dataset.text = v;
}

/** In-app "Reduce motion" (on top of the device setting): no movement, only quick fades. */
export const appReduceMotion = () => get('uv-reduce-motion') === '1';
export function setAppReduceMotion(on: boolean) {
  set('uv-reduce-motion', on ? '1' : null);
  document.documentElement.classList.toggle('reduce-motion', on);
}

/** Vibration on taps (phones that support it). */
export const hapticsOn = () => get('uv-haptics') !== 'off';
export const setHaptics = (on: boolean) => set('uv-haptics', on ? null : 'off');

/** For app/layout.tsx: applies the saved text size and reduce motion before the first paint. */
export const DISPLAY_PREFS_SCRIPT = `(function(){try{var t=localStorage.getItem('uv-text');if(t==='large'||t==='larger')document.documentElement.dataset.text=t;if(localStorage.getItem('uv-reduce-motion')==='1')document.documentElement.classList.add('reduce-motion');}catch(e){}})();`;
