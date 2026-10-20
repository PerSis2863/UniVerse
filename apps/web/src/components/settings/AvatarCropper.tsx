'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

// Stage 5 · Q18: crop a profile photo before it's uploaded. Drag (or use the arrow keys) to move it,
// the slider to zoom; the round frame shows what others will see. Made on the device as a 512 px
// square JPEG, so a big phone photo uploads small.

const SIZE = 512;
const BOX = 280; // the frame on screen, in CSS pixels

export function AvatarCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (cropped: File) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // the image centre's offset from the frame centre
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // At zoom 1 the photo just covers the frame.
  const cover = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * cover * zoom : BOX, h = img ? img.naturalHeight * cover * zoom : BOX;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.max(-(w - BOX) / 2, Math.min((w - BOX) / 2, p.x)), y: Math.max(-(h - BOX) / 2, Math.min((h - BOX) / 2, p.y)) });
  const shown = clamp(pos);

  const crop = async () => {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setBusy(false); return; }
    const k = SIZE / BOX;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, (BOX / 2 + shown.x - w / 2) * k, (BOX / 2 + shown.y - h / 2) * k, w * k, h * k);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    setBusy(false);
    if (blob) onDone(new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
  };

  return (
    <Sheet title="Crop your photo" onClose={onCancel}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={!img || busy} onClick={crop}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Use photo</button></div>}>
      <div className="space-y-4">
        <div
          role="img"
          aria-label="Photo preview: drag, or use the arrow keys, to move it"
          tabIndex={0}
          style={{ width: BOX, height: BOX }}
          className="relative mx-auto overflow-hidden rounded-2xl bg-zinc-200 dark:bg-zinc-800 touch-none cursor-grab active:cursor-grabbing select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: shown.x, py: shown.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 20 : 6;
            const d = ({ ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, number[]>)[e.key];
            if (d) { e.preventDefault(); setPos(clamp({ x: shown.x + d[0], y: shown.y + d[1] })); }
          }}
        >
          {img && (
            <Image src={img.src} alt="" width={Math.round(w)} height={Math.round(h)} unoptimized draggable={false} className="absolute max-w-none pointer-events-none" style={{ width: w, height: h, left: BOX / 2 + shown.x - w / 2, top: BOX / 2 + shown.y - h / 2 }} />
          )}
          {/* Outside the round frame others will see, darkened */}
          <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 0, transparent 70.5%, rgba(0,0,0,0.5) 71%)' }} />
          {!img && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" aria-hidden /></div>}
        </div>
        <label className="block mx-auto" style={{ maxWidth: BOX }}>
          <span className="label">Zoom</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-indigo-600" />
        </label>
      </div>
    </Sheet>
  );
}
