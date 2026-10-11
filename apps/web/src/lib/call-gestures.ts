'use client';

import type { GestureRecognizer } from '@mediapipe/tasks-vision';
import { gestureWatcher, type GestureAction } from './gestures';

// Watching my own camera for gestures (Stage 5 · B8.4, opt-in): MediaPipe's gesture recogniser,
// on this device (the engine from /mediapipe/wasm, the 8 MB model from Google's model storage,
// fetched the first time someone turns gestures on). Nothing about the picture leaves the device.

const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
let recognizer: Promise<GestureRecognizer> | null = null;

function load() {
  recognizer ??= (async () => {
    const { FilesetResolver, GestureRecognizer } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const make = (delegate: 'GPU' | 'CPU') => GestureRecognizer.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  recognizer.catch(() => { recognizer = null; });
  return recognizer;
}

/** Watches a camera track (about 4 times a second) and calls `onAction`; returns a stop function. */
export async function watchGestures(track: MediaStreamTrack, onAction: (a: GestureAction) => void): Promise<() => void> {
  const rec = await load();
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  await video.play().catch(() => {});
  const watch = gestureWatcher();
  let stopped = false, last = -1;
  const timer = setInterval(() => {
    if (stopped || video.readyState < 2 || track.readyState === 'ended') return;
    const now = performance.now();
    if (now <= last) return;
    last = now;
    try {
      const r = rec.recognizeForVideo(video, now);
      // The surest gesture of the hands in view, and where that hand's wrist is.
      let best: { gesture: string; score: number; wristY: number | null } | null = null;
      r.gestures.forEach((g, i) => {
        const top = g[0];
        if (top && (!best || top.score > best.score)) best = { gesture: top.categoryName, score: top.score, wristY: r.landmarks[i]?.[0]?.y ?? null };
      });
      const b = best as { gesture: string; score: number; wristY: number | null } | null;
      const action = watch({ gesture: b?.gesture ?? null, score: b?.score ?? 0, wristY: b?.wristY ?? null }, Date.now());
      if (action) onAction(action);
    } catch { /* a frame it couldn't read */ }
  }, 250);
  return () => { stopped = true; clearInterval(timer); video.pause(); video.srcObject = null; };
}
