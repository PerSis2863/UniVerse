'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { History, ImagePlus, Loader2, Palette, Plus } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { SIZES } from '@/lib/studio';
import { fadeUp, list } from '@/lib/motion';
import type { Doc } from '@/components/studio/studio-canvas';

// Studio (Stage 5 · B9.15): editing tools in Collaborate. The photo editor first (layers,
// adjustments, filters, text, shapes, background removal); video, audio and PDF editors next.
// Everything runs in the browser; the picture you're working on is kept on this device.

const PhotoEditor = dynamic(() => import('@/components/studio/PhotoEditor').then((m) => m.PhotoEditor), { ssr: false, loading: () => <div className="flex-1 p-8"><ContentSkeleton variant="grid" /></div> });

export default function StudioPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saved, setSaved] = useState<{ name: string; json: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The picture last worked on, kept on this device.
  useEffect(() => {
    let live = true;
    void import('@/components/studio/studio-canvas').then(async ({ readLocal }) => {
      const json = await readLocal();
      if (!live || !json) return;
      try { setSaved({ name: (JSON.parse(json) as { name?: string }).name || 'Untitled', json }); } catch { /* not a picture */ }
    });
    return () => { live = false; };
  }, [doc]);

  const blank = async (w: number, h: number, name: string) => {
    setDoc({ name, w, h, background: '#ffffff', layers: [] });
  };
  const openPhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy('open');
    try {
      const { canvasFromFile, rasterLayer } = await import('@/components/studio/studio-canvas');
      const c = await canvasFromFile(f);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Photo';
      setDoc({ name, w: c.width, h: c.height, background: null, layers: [rasterLayer(name, c, { x: 0, y: 0, w: c.width, h: c.height })] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const carryOn = async () => {
    if (!saved) return;
    setBusy('continue');
    try { const { deserialize } = await import('@/components/studio/studio-canvas'); setDoc(await deserialize(saved.json)); }
    catch (e) { toast.error((e as Error).message || 'Couldn’t open it.'); }
    finally { setBusy(null); }
  };

  return (
    <>
      <Topbar title="Studio" subtitle="Edit photos and make graphics: layers, filters, text and more, right in your browser" />
      <SectionTabs tabs={COLLAB_TABS} />
      {doc ? <PhotoEditor key={`${doc.name}-${doc.w}-${doc.h}`} initial={doc} onClose={() => setDoc(null)} /> : (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <motion.div variants={list} initial="hidden" animate="show" className="max-w-4xl mx-auto space-y-5">
            <motion.section variants={fadeUp} className="rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-5 sm:p-6" aria-labelledby="photo-title">
              <div className="flex items-start gap-4">
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white grid place-items-center shrink-0"><Palette className="w-6 h-6" aria-hidden /></span>
                <div className="min-w-0">
                  <h2 id="photo-title" className="text-lg font-bold text-zinc-900 dark:text-white">Photo editor</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">Layers, brushes, text and shapes; brightness, contrast, warmth and one-tap looks; crop, cut out, remove a photo’s background; export as PNG, JPG or WebP.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void openPhoto(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'open'} className="btn-primary">{busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}Open a photo</button>
                {saved && <button type="button" onClick={() => void carryOn()} disabled={busy === 'continue'} className="btn-secondary">{busy === 'continue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}Carry on with “{saved.name}”</button>}
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Or start blank</p>
              <ul className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {SIZES.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => void blank(s.w, s.h, s.name)} className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 p-3 text-left hover:border-indigo-400/60 transition-colors">
                      <span className="block mx-auto mb-2 bg-zinc-200 dark:bg-white/10 rounded" style={{ aspectRatio: `${s.w} / ${s.h}`, height: 40 }} aria-hidden />
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{s.name}</span>
                      <span className="block text-[11px] text-zinc-500 tabular-nums">{s.w} × {s.h}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.section>
            <motion.p variants={fadeUp} className="text-xs text-zinc-500 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" aria-hidden />Video, audio and PDF editors are coming to Studio next. Your work stays on this device until you export it.</motion.p>
          </motion.div>
        </div>
      )}
    </>
  );
}
