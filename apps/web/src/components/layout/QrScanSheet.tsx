'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

// Scan a QR code from the phone's "+" menu (Stage 5 · Q8): a class check-in, a board, a document,
// a passport or any UniVerse link opens here in the app; anything else is shown to copy (never
// opened, so a code can't send someone to a strange site). Uses the browser's own QR reader where
// there is one (Android Chrome), else jsQR.

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = (new (opts?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };
const READ_SIZE = 960;

/** The in-app address of a scanned code, if it's one of ours. */
export function inAppPath(text: string, origin: string): string | null {
  try {
    const u = new URL(text.trim(), origin);
    if (u.origin !== origin || !/^https?:$/.test(u.protocol)) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch { return null; }
}

export default function QrScanSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const go = useRef((path: string) => { router.push(path); onClose(); });
  useEffect(() => { go.current = (path: string) => { router.push(path); onClose(); }; });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const findDetector = async (): Promise<Detector | null> => {
      const D = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      if (!D) return null;
      try { const f = await D.getSupportedFormats?.(); return !f || f.includes('qr_code') ? new D({ formats: ['qr_code'] }) : null; } catch { return null; }
    };
    const read = async (v: HTMLVideoElement, detector: Detector | null): Promise<string | null> => {
      if (detector) return (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
      if (!ctx || !v.videoWidth) return null;
      const scale = Math.min(1, READ_SIZE / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.drawImage(v, 0, 0, w, h);
      return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
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
        const text = v.readyState >= 2 ? await read(v, detector) : null;
        if (text) {
          const path = inAppPath(text, window.location.origin);
          navigator.vibrate?.(30);
          if (path) { stopped = true; go.current(path); return; }
          setOther(text.slice(0, 500));
        }
        timer = setTimeout(() => void step(), 80);
      };
      void step();
    })().catch(() => { if (!stopped) setProblem('The camera isn’t available. Allow it for UniVerse in your browser’s settings, then try again.'); });
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <Sheet title="Scan a QR code" onClose={onClose}>
      {problem ? <p className="text-sm text-rose-600 dark:text-rose-400">{problem}</p> : (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
            <video ref={video} muted playsInline className="w-full h-full object-cover" aria-label="Camera view" />
            <div aria-hidden className="absolute inset-[14%] rounded-2xl border-2 border-white/70" />
          </div>
          {other ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3 space-y-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">This code isn’t a UniVerse link. It says:</p>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 break-all">{other}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(other).then(() => toast.success('Copied')); }} className="btn-secondary btn-sm"><Copy className="w-3.5 h-3.5" />Copy</button>
                {/^https?:\/\//i.test(other) && <span className="text-xs text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Check the address before opening it in your browser.</span>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300" aria-live="polite">Point the camera at the code: a class check-in, a board, a document or any UniVerse link opens straight away.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
