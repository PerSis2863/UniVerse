'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';

// Loads the screen translator (Stage 5 · Q21) only for people who chose a language other than
// English, so English pages carry none of it. The language is read straight from storage and from
// the "uv-language" event that src/lib/language-script.ts sends when it changes.
const UiTranslator = dynamic(() => import('./UiTranslator'), { ssr: false });
const subscribe = (cb: () => void) => { window.addEventListener('uv-language', cb); return () => window.removeEventListener('uv-language', cb); };
const read = () => {
  try { return (JSON.parse(localStorage.getItem('universe-language') || '{}').state?.language as string | undefined) ?? 'en'; } catch { return 'en'; }
};

export default function UiTranslatorGate() {
  const lang = useSyncExternalStore(subscribe, () => document.documentElement.lang || read(), () => 'en');
  return lang && lang !== 'en' ? <UiTranslator /> : null;
}
