'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Sheet } from '@/components/ui/Sheet';
import { FrameCollector } from '@/lib/qr-relay';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

// Stage 5 · D17: reads the teacher's moving codes with the camera, with no connection. Uses the
// phone's own QR reader where there is one (BarcodeDetector: Android Chrome), else jsQR (iPhone,
// Firefox, computers). Loaded on demand, and fetched ahead while online so it works offline
// (src/components/offline/QrRelayScan.tsx).

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = (new (opts?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

/** Longest side of the picture jsQR reads (bigger is slower; codes stay readable at this size). */
const READ_SIZE = 960;

export default function QrRelayCamera({ onDone, onClose }: { onDone: (bytes: Uint8Array) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ have: number; total: number; got: boolean[] } | null>(null);
  const [notOurs, setNotOurs] = useState(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const collector = new FrameCollector();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const findDetector = async (): Promise<Detector | null> => {
      const D = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      if (!D) return null;
      try {
        const formats = await D.getSupportedFormats?.();
        return !formats || formats.includes('qr_code') ? new D({ formats: ['qr_code'] }) : null;
      } catch { return null; }
    };

    const read = async (v: HTMLVideoElement, detector: Detector | null): Promise<string[]> => {
      if (detector) return (await detector.detect(v).catch(() => [])).map((c) => c.rawValue);
      if (!ctx || !v.videoWidth) return [];
      const scale = Math.min(1, READ_SIZE / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      return code ? [code.data] : [];
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
      const detector = await findDetector();
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play().catch(() => {});
      const step = async () => {
        if (stopped) return;
        if (v.readyState >= 2) {
          for (const text of await read(v, detector)) {
            const st = collector.add(text);
            if (st.state === 'ignored') { if (!text.startsWith('UV1:')) setNotOurs(true); continue; }
            setNotOurs(false);
            const missing = new Set(collector.missing());
            setProgress({ have: st.have, total: st.total, got: Array.from({ length: st.total }, (_, i) => !missing.has(i + 1)) });
            if (st.state === 'done') {
              stopped = true;
              haptic('success');
              done.current(collector.bytes());
              return;
            }
          }
        }
        timer = setTimeout(() => void step(), 50);
      };
      void step();
    })().catch(() => { if (!stopped) setProblem('The camera isn’t available. Allow it for UniVerse in your browser’s settings, then try again.'); });

    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const share = progress ? progress.have / progress.total : 0;
  return (
    <Sheet title="Scan from the teacher’s screen" onClose={onClose}>
      {problem ? <p className="text-sm text-rose-600 dark:text-rose-400">{problem}</p> : (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={video} muted playsInline className="w-full h-full object-cover" aria-label="Camera view" />
            <div aria-hidden className="absolute inset-[12%] rounded-2xl border-2 border-white/70" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white" aria-live="polite">
              {progress ? `${progress.have} of ${progress.total} codes read` : 'Point the camera at the codes'}
            </p>
            <div className="mt-2 h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden>
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            {progress && progress.total > 1 && (
              <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
                {progress.got.map((g, i) => <span key={i} className={cn('w-2.5 h-2.5 rounded-sm', g ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700')} />)}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {notOurs ? 'That code isn’t one of UniVerse’s moving codes. Point at the teacher’s screen.' : 'Keep the whole code inside the frame and hold still. Missed codes come round again; no internet needed.'}
          </p>
        </div>
      )}
    </Sheet>
  );
}
