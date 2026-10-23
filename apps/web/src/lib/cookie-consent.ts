// The visitor's cookie choice (the cookie notice, src/components/marketing/CookieNotice.tsx, and
// Privacy choices). UniVerse itself only uses what it needs to work, so nothing waits on this today.
// Anything optional added later (analytics, ads, social embeds) must start only when
// `optionalCookiesAllowed()` is true, and stop when the `uv-cookies` event says it no longer is.

export type CookieChoice = 'all' | 'essential';

const KEY = 'uv-cookies';
export const CHOICE_EVENT = 'uv-cookies';

export function cookieChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'all' || v === 'essential' ? v : null;
  } catch { return null; } // storage off (private mode, blocked): no choice saved
}

export function setCookieChoice(choice: CookieChoice) {
  try { localStorage.setItem(KEY, choice); } catch { /* storage off: the choice lasts this page only */ }
  window.dispatchEvent(new CustomEvent(CHOICE_EVENT, { detail: choice }));
}

/** The browser's Global Privacy Control signal: a standing "no" to optional tracking. */
export function privacySignal(): boolean {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** True only after the visitor chose "Accept all" and their browser doesn't say no. */
export function optionalCookiesAllowed(): boolean {
  return !privacySignal() && cookieChoice() === 'all';
}
