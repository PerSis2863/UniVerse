'use client';

// Display preferences from Settings → Appearance and Accessibility, kept on this device and applied
// before the first paint (the inline script in app/layout.tsx), so nothing jumps after loading.

export type TextSize = 'default' | 'large' | 'larger' | 'largest';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };

const SIZES: TextSize[] = ['large', 'larger', 'largest'];
export const textSize = (): TextSize => (SIZES.includes(get('uv-text') as TextSize) ? (get('uv-text') as TextSize) : 'default');
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

/**
 * Reading aids (Settings → Appearance), each a class on <html> that globals.css styles:
 * bold text, more contrast, a dyslexia-friendly font (OpenDyslexic, self-hosted), underlined links.
 * Captions on: calls start with live captions turned on (CallView reads captionsByDefault).
 */
export const READING_AIDS = {
  bold: { key: 'uv-bold', cls: 'bold-text' },
  contrast: { key: 'uv-contrast', cls: 'high-contrast' },
  dyslexic: { key: 'uv-dyslexic', cls: 'dyslexic-font' },
  underline: { key: 'uv-underline', cls: 'underline-links' },
} as const;
export type ReadingAid = keyof typeof READING_AIDS;
export const readingAid = (a: ReadingAid) => get(READING_AIDS[a].key) === '1';
export function setReadingAid(a: ReadingAid, on: boolean) {
  set(READING_AIDS[a].key, on ? '1' : null);
  document.documentElement.classList.toggle(READING_AIDS[a].cls, on);
}
export const captionsByDefault = () => get('uv-captions') === '1';
export const setCaptionsByDefault = (on: boolean) => set('uv-captions', on ? '1' : null);

/** Vibration on taps (phones that support it). */
export const hapticsOn = () => get('uv-haptics') !== 'off';
export const setHaptics = (on: boolean) => set('uv-haptics', on ? null : 'off');

/** For app/layout.tsx: applies the saved text size and reduce motion before the first paint. */
export const DISPLAY_PREFS_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,t=s.getItem('uv-text');if(t==='large'||t==='larger'||t==='largest')d.dataset.text=t;if(s.getItem('uv-reduce-motion')==='1')d.classList.add('reduce-motion');${Object.values(READING_AIDS).map((a) => `if(s.getItem('${a.key}')==='1')d.classList.add('${a.cls}');`).join('')}}catch(e){}})();`;
