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
/** Video calls start with my camera off (Stage 5 · Q23); I can turn it on in the call. */
export const cameraOffByDefault = () => get('uv-cam-off') === '1';
export const setCameraOffByDefault = (on: boolean) => set('uv-cam-off', on ? '1' : null);

/**
 * Reading level that course materials and assignment instructions open at (Stage 5 · D9): as
 * written, or rewritten by AI for Grade 8 or Grade 5 (src/lib/reading-level.ts). Read-aloud speed too.
 */
export type ReadingLevelPref = 'original' | 'g8' | 'g5';
export const readingLevel = (): ReadingLevelPref => { const v = get('uv-reading-level'); return v === 'g8' || v === 'g5' ? v : 'original'; };
export const setReadingLevel = (v: ReadingLevelPref) => set('uv-reading-level', v === 'original' ? null : v);
/** Help with selected text: select any text in the app to hear it or read it in simpler words. */
export const SELECT_HELP_EVENT = 'uv-select-help';
export const selectHelp = () => get('uv-select-help') === '1';
export function setSelectHelp(on: boolean) { set('uv-select-help', on ? '1' : null); window.dispatchEvent(new Event(SELECT_HELP_EVENT)); }
export const SPEECH_RATES = [0.8, 1, 1.25] as const;
export const speechRate = (): number => { const v = Number(get('uv-speech-rate')); return (SPEECH_RATES as readonly number[]).includes(v) ? v : 1; };
export const setSpeechRate = (v: number) => set('uv-speech-rate', v === 1 ? null : String(v));

/** The day calendars start the week on (Stage 5 · Q23): 1 Monday (the default) or 0 Sunday. */
export const WEEK_START_EVENT = 'uv-week-start';
export const weekStartsOn = (): 0 | 1 => (get('uv-week-start') === 'sun' ? 0 : 1);
export function setWeekStartsOn(v: 0 | 1) { set('uv-week-start', v === 0 ? 'sun' : null); window.dispatchEvent(new Event(WEEK_START_EVENT)); }
/** My own video shown as in a mirror (the default; others always see it the right way round). */
export const mirrorSelf = () => get('uv-mirror') !== 'off';
export const setMirrorSelf = (on: boolean) => set('uv-mirror', on ? null : 'off');

/** Vibration on taps (phones that support it). */
export const hapticsOn = () => get('uv-haptics') !== 'off';
export const setHaptics = (on: boolean) => set('uv-haptics', on ? null : 'off');

/** The accent colour (Phase E): buttons, highlights, links and focus rings; UniVerse's dark blue and pink is the default. */
export const ACCENTS = [
  { id: 'indigo', name: 'Blue & pink', swatch: '#253745' },
  { id: 'violet', name: 'Dusk', swatch: '#3a3a44' },
  { id: 'blue', name: 'Blue', swatch: '#1d4ed8' },
  { id: 'teal', name: 'Teal', swatch: '#0f766e' },
  { id: 'rose', name: 'Rose', swatch: '#be123c' },
  { id: 'amber', name: 'Amber', swatch: '#b45309' },
] as const;
export type Accent = (typeof ACCENTS)[number]['id'];
export const accent = (): Accent => (ACCENTS.find((a) => a.id === get('uv-accent'))?.id ?? 'indigo');
export function setAccent(a: Accent) {
  set('uv-accent', a === 'indigo' ? null : a);
  if (a === 'indigo') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = a;
}

/** For app/layout.tsx: applies the saved text size, accent and reduce motion before the first paint. */
export const DISPLAY_PREFS_SCRIPT = `(function(){try{var d=document.documentElement,s=localStorage,t=s.getItem('uv-text');if(t==='large'||t==='larger'||t==='largest')d.dataset.text=t;var a=s.getItem('uv-accent');if(a&&/^(violet|blue|teal|rose|amber)$/.test(a))d.dataset.accent=a;if(s.getItem('uv-reduce-motion')==='1')d.classList.add('reduce-motion');${Object.values(READING_AIDS).map((a) => `if(s.getItem('${a.key}')==='1')d.classList.add('${a.cls}');`).join('')}}catch(e){}})();`;
