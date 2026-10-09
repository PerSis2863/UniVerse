'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

// A barcode field for the library (Stage 5 · B15.4): type it, use a USB scanner (it types the code
// and presses Enter), or scan with the camera where the browser can read barcodes (BarcodeDetector:
// Chrome, Edge, Android; not Safari, which keeps the typing).

interface Detector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector } }

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
const noop = () => () => {};
const hasDetector = () => typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia;

export function ScanField({ label, value, onChange, onScan, placeholder, autoFocus, busy }: {
  label: string; value: string; onChange: (v: string) => void; onScan: (code: string) => void; placeholder?: string; autoFocus?: boolean; busy?: boolean;
}) {
  const camera = useSyncExternalStore(noop, hasDetector, () => false);
  const [scanning, setScanning] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={`scan-${label}`}>{label}</label>
      <div className="mt-1 flex gap-2">
        <div className="relative flex-1 min-w-0">
          <ScanLine className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input id={`scan-${label}`} value={value} autoFocus={autoFocus} disabled={busy} inputMode="text" autoComplete="off" spellCheck={false}
            onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { e.preventDefault(); onScan(value.trim()); } }}
            className="input pl-9 font-mono" placeholder={placeholder ?? 'Scan or type, then Enter'} />
        </div>
        {camera && <button type="button" onClick={() => setScanning(true)} aria-label={`${label}: scan with the camera`} className="btn-secondary shrink-0"><Camera className="w-4 h-4" /></button>}
      </div>
      {scanning && <CameraScan onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); onChange(code); onScan(code); }} />}
    </div>
  );
}

function CameraScan({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const found = useRef(onCode);
  useEffect(() => { found.current = onCode; });
  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | undefined, stopped = false;
    const detector = new window.BarcodeDetector!({ formats: FORMATS });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(async (s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      if (!video.current) return;
      video.current.srcObject = s;
      await video.current.play().catch(() => {});
      timer = setInterval(async () => {
        if (!video.current || video.current.readyState < 2) return;
        const codes = await detector.detect(video.current).catch(() => []);
        const code = codes[0]?.rawValue?.trim();
        if (code && !stopped) { stopped = true; navigator.vibrate?.(40); found.current(code); }
      }, 250);
    }).catch(() => setProblem('The camera isn’t available. Allow it in the browser, or type the barcode.'));
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <Sheet title="Scan a barcode" onClose={onClose}>
      {problem ? <p className="text-sm text-rose-600 dark:text-rose-400">{problem}</p> : (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
          <video ref={video} muted playsInline className="w-full h-full object-cover" aria-label="Camera view" />
          <div aria-hidden className="absolute inset-x-8 top-1/2 h-0.5 bg-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">Hold the barcode inside the frame. It’s read by itself.</p>
    </Sheet>
  );
}
