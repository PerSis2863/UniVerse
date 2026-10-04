'use client';

import { useEffect, useRef } from 'react';

// Live captions: each person's browser turns their own speech into text (the Web Speech API;
// Chrome and Edge send the audio to their speech service, Safari does it on the device) and the
// call shares the words. Nothing runs unless someone in the call has captions on. Words in
// progress go out at most every 700 ms; finished sentences right away.

interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const captionsSupported = () => ctor() !== null;

const INTERIM_MS = 700;

export function useCaptions(active: boolean, onText: (text: string, final: boolean) => void, onFatal: (why: string) => void) {
  const textRef = useRef(onText);
  const fatalRef = useRef(onFatal);
  useEffect(() => { textRef.current = onText; fatalRef.current = onFatal; });

  useEffect(() => {
    const Ctor = ctor();
    if (!active || !Ctor) return;
    let on = true;
    let rec: Recognition | null = null;
    let lastSent = 0;
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastError = '';

    const flush = () => {
      timer = null;
      if (pending) { textRef.current(pending, false); lastSent = Date.now(); pending = null; }
    };

    const begin = () => {
      if (!on) return;
      rec = new Ctor();
      rec.lang = navigator.language || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const said = r[0]?.transcript ?? '';
          if (r.isFinal) {
            if (said.trim()) textRef.current(said.trim(), true);
            pending = null;
          } else interim += said;
        }
        if (!interim.trim()) return;
        pending = interim.trim();
        const wait = INTERIM_MS - (Date.now() - lastSent);
        if (wait <= 0) flush();
        else timer ??= setTimeout(flush, wait);
      };
      rec.onerror = (e) => {
        lastError = e.error;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
          on = false;
          fatalRef.current(e.error === 'language-not-supported' ? 'Captions don’t support your browser’s language yet.' : 'Captions need permission to use speech recognition in this browser.');
        }
      };
      // Recognition stops by itself after a pause or a minute; keep it going while needed.
      // A network hiccup waits a little longer so it doesn't spin.
      rec.onend = () => { if (on) setTimeout(begin, lastError === 'network' ? 3000 : 250); lastError = ''; };
      try { rec.start(); } catch { /* already started */ }
    };
    begin();

    return () => {
      on = false;
      if (timer) clearTimeout(timer);
      try { rec?.abort(); } catch { /* stopped */ }
    };
  }, [active]);
}
