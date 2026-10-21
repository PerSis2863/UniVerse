'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ArrowLeft, AudioWaveform, Clapperboard, FileText, History, ImagePlus, Loader2, Mic, Minimize2, Music, Palette, Repeat2, type LucideIcon } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, COLLAB_TABS } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { SIZES } from '@/lib/studio';
import { fadeUp, list } from '@/lib/motion';
import type { Doc } from '@/components/studio/studio-canvas';

// Collaborate → Tools (was Studio; Stage 5 · B9.14–B9.15): every file tool in one simple grid.
// Convert and Compress open here; the photo, PDF, video and audio editors open full screen.
// The tool in use is in the address (?tool=…), so the back button returns to the grid.
// Everything runs in the browser; files stay on this device until you save or share them.

const editorLoading = () => <div className="flex-1 p-8"><ContentSkeleton variant="grid" /></div>;
const PhotoEditor = dynamic(() => import('@/components/studio/PhotoEditor').then((m) => m.PhotoEditor), { ssr: false, loading: editorLoading });
const PdfEditor = dynamic(() => import('@/components/studio/PdfEditor').then((m) => m.PdfEditor), { ssr: false, loading: editorLoading });
const VideoEditor = dynamic(() => import('@/components/studio/VideoEditor').then((m) => m.VideoEditor), { ssr: false, loading: editorLoading });
const AudioEditor = dynamic(() => import('@/components/studio/AudioEditor').then((m) => m.AudioEditor), { ssr: false, loading: editorLoading });
const Converter = dynamic(() => import('@/components/docs/Converter').then((m) => m.Converter), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });
const Compressor = dynamic(() => import('@/components/docs/Compressor').then((m) => m.Compressor), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });

type Panel = 'convert' | 'compress' | 'photo' | 'audio';
const PANELS: Panel[] = ['convert', 'compress', 'photo', 'audio'];

interface Tool { id: Panel | 'pdf' | 'video'; name: string; what: string; icon: LucideIcon; tint: string }
const TOOLS: Tool[] = [
  { id: 'convert', name: 'Convert files', what: 'Word to PDF, PDF to pictures, Excel to CSV and more', icon: Repeat2, tint: 'from-indigo-500 to-sky-500' },
  { id: 'compress', name: 'Compress files', what: 'Make PDFs, photos, videos and documents smaller', icon: Minimize2, tint: 'from-emerald-500 to-teal-500' },
  { id: 'pdf', name: 'Edit a PDF', what: 'Sign, fill in, reorder or remove pages', icon: FileText, tint: 'from-rose-500 to-amber-500' },
  { id: 'photo', name: 'Edit a photo', what: 'Crop, adjust, add text, remove a background', icon: Palette, tint: 'from-indigo-500 to-fuchsia-500' },
  { id: 'video', name: 'Edit a video', what: 'Trim, join clips, add text and music', icon: Clapperboard, tint: 'from-violet-500 to-sky-500' },
  { id: 'audio', name: 'Edit sound', what: 'Record, trim and clean up audio', icon: AudioWaveform, tint: 'from-emerald-500 to-sky-500' },
];

export default function ToolsPage() {
  return (
    <Suspense fallback={<><Topbar title="Tools" /><SectionTabs tabs={COLLAB_TABS} /><div className="flex-1 p-8"><ContentSkeleton variant="grid" /></div></>}>
      <Tools />
    </Suspense>
  );
}

function Tools() {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get('tool');
  const panel = PANELS.includes(asked as Panel) ? (asked as Panel) : null;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  // The audio editor: a file to open, or 'record' to start empty.
  const [audio, setAudio] = useState<File | 'record' | null>(null);
  const [video, setVideo] = useState<File[] | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const open = (p: Panel | null) => router.push(p ? `/studio?tool=${p}` : '/studio', { scroll: false });
  const pick = (t: Tool['id']) => (t === 'pdf' ? pdfRef.current?.click() : t === 'video' ? videoRef.current?.click() : open(t));

  const editor = video ? <VideoEditor key={video.map((f) => f.name + f.size).join('|')} files={video} onClose={() => setVideo(null)} />
    : audio ? <AudioEditor key={audio === 'record' ? 'record' : audio.name + audio.size} file={audio === 'record' ? null : audio} onClose={() => setAudio(null)} />
    : pdf ? <PdfEditor key={pdf.name + pdf.size} file={pdf} onClose={() => setPdf(null)} />
    : doc ? <PhotoEditor key={`${doc.name}-${doc.w}-${doc.h}`} initial={doc} onClose={() => setDoc(null)} />
    : null;

  return (
    <>
      <Topbar title="Tools" subtitle="Convert, compress and edit files: PDFs, photos, video and sound" />
      <SectionTabs tabs={COLLAB_TABS} />
      <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" aria-label="Choose a PDF to edit" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/*,image/*" multiple className="hidden" aria-label="Choose videos to edit" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) setVideo(fs); }} />
      {editor ?? (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4">
            {panel ? (
              <>
                <button type="button" onClick={() => open(null)} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white min-h-11"><ArrowLeft className="w-4 h-4" aria-hidden />All tools</button>
                {panel === 'convert' && <Converter onClose={() => open(null)} />}
                {panel === 'compress' && <Compressor onClose={() => open(null)} />}
                {panel === 'photo' && <PhotoStart onOpen={setDoc} />}
                {panel === 'audio' && <AudioStart onOpen={setAudio} />}
              </>
            ) : (
              <motion.ul variants={list} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Tools">
                {TOOLS.map((t) => (
                  <motion.li key={t.id} variants={fadeUp}>
                    <button type="button" onClick={() => pick(t.id)} className="w-full h-full text-start rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 hover:border-indigo-400/60 transition-colors">
                      <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${t.tint} text-white grid place-items-center`}><t.icon className="w-5 h-5" aria-hidden /></span>
                      <span className="block mt-3 font-bold text-zinc-900 dark:text-white">{t.name}</span>
                      <span className="block mt-0.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">{t.what}</span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
            {!panel && <p className="text-xs text-zinc-600 dark:text-zinc-400">Everything runs in your browser: your files stay on this device until you save or share them.</p>}
          </div>
        </div>
      )}
    </>
  );
}

/** Edit a photo: open one, carry on with the last one, or start blank. */
function PhotoStart({ onOpen }: { onOpen: (d: Doc) => void }) {
  const [saved, setSaved] = useState<{ name: string; json: string } | null>(null);
  const [busy, setBusy] = useState<'open' | 'continue' | null>(null);
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
  }, []);
  const openPhoto = async (f: File | undefined) => {
    if (!f) return;
    setBusy('open');
    try {
      const { canvasFromFile, rasterLayer } = await import('@/components/studio/studio-canvas');
      const c = await canvasFromFile(f);
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Photo';
      onOpen({ name, w: c.width, h: c.height, background: null, layers: [rasterLayer(name, c, { x: 0, y: 0, w: c.width, h: c.height })] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const carryOn = async () => {
    if (!saved) return;
    setBusy('continue');
    try { const { deserialize } = await import('@/components/studio/studio-canvas'); onOpen(await deserialize(saved.json)); }
    catch (e) { toast.error((e as Error).message || 'Couldn’t open it.'); }
    finally { setBusy(null); }
  };
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="photo-title">
      <div>
        <h2 id="photo-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><Palette className="w-4 h-4 text-indigo-500" aria-hidden />Edit a photo</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">Crop, brightness and colour, one-tap looks, text and shapes, remove a background; save as PNG, JPG or WebP.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose a photo" onChange={(e) => void openPhoto(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'open'} className="btn-primary">{busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}Open a photo</button>
        {saved && <button type="button" onClick={() => void carryOn()} disabled={busy === 'continue'} className="btn-secondary">{busy === 'continue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}Carry on with “{saved.name}”</button>}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Or start blank</p>
        <ul className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SIZES.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen({ name: s.name, w: s.w, h: s.h, background: '#ffffff', layers: [] })} className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 p-3 text-start hover:border-indigo-400/60 transition-colors">
                <span className="block mx-auto mb-2 bg-zinc-200 dark:bg-white/10 rounded" style={{ aspectRatio: `${s.w} / ${s.h}`, height: 40 }} aria-hidden />
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">{s.name}</span>
                <span className="block text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums">{s.w} × {s.h}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Edit sound: open a recording or record a new one. */
function AudioStart({ onOpen }: { onOpen: (a: File | 'record') => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <section className="panel p-5 space-y-4" aria-labelledby="audio-title">
      <div>
        <h2 id="audio-title" className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><AudioWaveform className="w-4 h-4 text-emerald-500" aria-hidden />Edit sound</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">For podcasts and voice assignments: trim, cut, fade, make it louder or quieter, even out the volume and turn down hiss; save as WAV.</p>
      </div>
      <input ref={ref} type="file" accept="audio/*,video/*" className="hidden" aria-label="Choose a sound file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onOpen(f); e.target.value = ''; }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => ref.current?.click()} className="btn-primary"><Music className="w-4 h-4" />Open a sound</button>
        <button type="button" onClick={() => onOpen('record')} className="btn-secondary"><Mic className="w-4 h-4" />Record</button>
      </div>
    </section>
  );
}
