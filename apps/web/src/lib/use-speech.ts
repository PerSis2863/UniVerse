'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { speechChunks } from './reading-level';

// Read aloud (Stage 5 · D9, reading-level adapter): the browser's own voices (speechSynthesis), so
// it's free and the text doesn't leave the device. Texts are read one after another in short pieces
// (some browsers stop a long one after about 15 seconds); `at` is the text being read.

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** A voice for this language (e.g. "fr" or "fr-FR"): the device's default one for it first. */
function voiceFor(lang: string) {
  const want = lang.toLowerCase();
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(want));
  return voices.find((v) => v.default) ?? voices.find((v) => v.localService) ?? voices[0];
}

export function useSpeech() {
  const [at, setAt] = useState<number | null>(null);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current++;
    if (speechSupported()) window.speechSynthesis.cancel();
    setAt(null);
  }, []);

  // Leaving the page stops reading.
  useEffect(() => () => { run.current++; if (speechSupported()) window.speechSynthesis.cancel(); }, []);

  /** Reads `texts` from number `from` on, in `lang` when known (otherwise the device's language), at `rate` (1 is normal). */
  const speak = useCallback((texts: string[], { from = 0, lang, rate = 1 }: { from?: number; lang?: string; rate?: number } = {}) => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const id = ++run.current;
    const voice = lang ? voiceFor(lang) : undefined;
    const queue: { u: SpeechSynthesisUtterance; i: number }[] = [];
    texts.forEach((text, i) => {
      if (i < from) return;
      for (const chunk of speechChunks(text)) {
        const u = new SpeechSynthesisUtterance(chunk);
        if (lang) u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = rate;
        queue.push({ u, i });
      }
    });
    if (!queue.length) { setAt(null); return; }
    for (const { u, i } of queue) u.onstart = () => { if (run.current === id) setAt(i); };
    const last = queue[queue.length - 1].u;
    const done = () => { if (run.current === id) setAt(null); };
    last.onend = done;
    for (const { u } of queue) u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') done(); };
    setAt(queue[0].i);
    for (const { u } of queue) synth.speak(u);
  }, []);

  return { at, speaking: at !== null, speak, stop };
}
