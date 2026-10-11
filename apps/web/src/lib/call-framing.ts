'use client';

import type { FaceDetector } from '@mediapipe/tasks-vision';
import { ticker } from './call-background';
import { frameFor, glide, type Box } from './framing';

// Auto-framing my camera (Stage 5 · B8.8, opt-in): MediaPipe's face detector finds my face about 5
// times a second (the engine from /mediapipe/wasm, the 230 KB model from Google's model storage,
// fetched the first time) and each frame is drawn cropped towards it, gliding rather than jumping.
// The picture never leaves the device to do this.

const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let detector: Promise<FaceDetector> | null = null;
function load() {
  detector ??= (async () => {
    const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const make = (delegate: 'GPU' | 'CPU') => FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5 });
    try { return await make('GPU'); } catch { return await make('CPU'); }
  })();
  detector.catch(() => { detector = null; });
  return detector;
}

export interface Framing { track: MediaStreamTrack; stop(): void }

/** The camera, framed on my face. Throws if this device can't do it. */
export async function applyFraming(raw: MediaStreamTrack): Promise<Framing> {
  const det = await load();
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  video.srcObject = new MediaStream([raw]);
  await video.play().catch(() => {});
  if (video.readyState < 2) await new Promise((r) => video.addEventListener('loadeddata', r, { once: true }));
  const W = video.videoWidth || 1280, H = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  let crop: Box = { x: 0, y: 0, w: W, h: H }, target = crop, lastSeen = 0, lastDetect = 0, lastT = -1;
  const fps = 24;
  const stopTick = ticker(fps, () => {
    if (video.readyState < 2 || raw.readyState === 'ended') return;
    const now = performance.now();
    if (now - lastDetect > 200 && now > lastT) {
      lastDetect = now; lastT = now;
      try {
        const faces = det.detectForVideo(video, now).detections;
        // The biggest face (the one nearest the camera).
        const box = faces.map((d) => d.boundingBox).filter((b): b is NonNullable<typeof b> => !!b).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (box) { target = frameFor({ x: box.originX, y: box.originY, w: box.width, h: box.height }, W, H); lastSeen = now; }
        // Nobody for 3 s: back to the whole picture.
        else if (now - lastSeen > 3000) target = { x: 0, y: 0, w: W, h: H };
      } catch { /* a frame it couldn't read */ }
    }
    crop = glide(crop, target, 0.08);
    g.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
  });
  const track = canvas.captureStream(fps).getVideoTracks()[0];
  return { track, stop: () => { stopTick(); track.stop(); video.pause(); video.srcObject = null; } };
}
