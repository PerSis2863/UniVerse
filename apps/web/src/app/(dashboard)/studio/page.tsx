'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { ArrowLeft, AudioWaveform, Braces, CaseSensitive, Clapperboard, Code2, Combine, FileImage, FileStack, FileText, GitCompare, Hash, History, ImagePlus, Loader2, Mic, Minimize2, MonitorPlay, Music, NotebookPen, Palette, PenTool, QrCode, Regex, Repeat2, Rows3, Scissors, Sparkles, SwatchBook, Table2, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import type { QuickId } from '@/components/studio/QuickTools';
import type { PdfId } from '@/components/studio/PdfTools';
import type { MoreId } from '@/components/studio/MoreTools';
import type { ImageId } from '@/components/studio/ImageTools';
import { AppWindow, BookOpenCheck, Calculator, CalendarRange, ChartColumn, CircleUser, Clock, Contrast, Crop, Droplet, FileCode2, Fingerprint, KeyRound, LayoutGrid, Link2, MessageSquareQuote, Mic as MicIcon, Omega, Percent, Pipette, Presentation, Quote, Replace, Ruler, Shuffle, Stamp, Timer, Volume2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CollabTabs } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { SIZES } from '@/lib/studio';
import { fadeUp, list } from '@/lib/motion';
import type { Doc } from '@/components/studio/studio-canvas';

// Collaborate → Create (was Tools, before that Studio; Stage 5 · B9.14–B9.15; M68 merged Docs, Whiteboards
// and Tools under it and added 16 small tools: notes, writing, PDF, tables, design and code helpers).
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

const QuickTool = dynamic(() => import('@/components/studio/QuickTools').then((m) => m.QuickTool), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });
const PdfTool = dynamic(() => import('@/components/studio/PdfTools').then((m) => m.PdfTool), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });
const MoreTool = dynamic(() => import('@/components/studio/MoreTools').then((m) => m.MoreTool), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });
const ImageTool = dynamic(() => import('@/components/studio/ImageTools').then((m) => m.ImageTool), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });
const QuickNotes = dynamic(() => import('@/components/studio/QuickNotes').then((m) => m.QuickNotes), { ssr: false, loading: () => <div className="h-48 rounded-2xl skeleton" /> });

type Pdf3 = `pdf-${PdfId}`;
type Panel = 'convert' | 'compress' | 'photo' | 'audio' | 'notes' | QuickId | Pdf3 | MoreId | `img-${ImageId}`;
// M71: the second set (28 more tools).
const MORE: MoreId[] = ['replace', 'read', 'cite', 'speak', 'dictate', 'symbols', 'calc', 'units', 'percent', 'picker', 'chart', 'dates', 'present', 'timer', 'contrast', 'colour', 'hash', 'uuid', 'password', 'time', 'url', 'jwt'];
const IMAGES: ImageId[] = ['resize', 'quote', 'collage', 'avatar', 'beautify', 'codeimg', 'watermark'];
const QUICK: QuickId[] = ['words', 'clean', 'compare', 'table', 'colours', 'gradient', 'json', 'regex', 'markdown', 'encode', 'qr', 'record'];
const PANELS: Panel[] = ['convert', 'compress', 'photo', 'audio', 'notes', ...QUICK, 'pdf-merge', 'pdf-split', 'pdf-images', ...MORE, ...IMAGES.map((i) => `img-${i}` as const)];

interface Tool { id: Panel | 'pdf' | 'video'; name: string; what: string; icon: LucideIcon; tint: string; group: string }
const TOOLS: Tool[] = [
  { group: 'Write', id: 'notes', name: 'Quick notes', what: 'Jot it down: pin, colour, tick boxes, search', icon: NotebookPen, tint: 'from-amber-400 to-orange-500' },
  { group: 'Write', id: 'words', name: 'Word count', what: 'Words, sentences, reading and speaking time', icon: Hash, tint: 'from-indigo-500 to-sky-500' },
  { group: 'Write', id: 'clean', name: 'Clean up text', what: 'Change case, tidy spaces, sort, remove repeats', icon: CaseSensitive, tint: 'from-sky-500 to-cyan-500' },
  { group: 'Write', id: 'compare', name: 'Compare texts', what: 'See exactly what changed between two versions', icon: GitCompare, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Write', id: 'replace', name: 'Find and replace', what: 'Change a word everywhere, matching case or whole words', icon: Replace, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Write', id: 'read', name: 'How easy to read', what: 'Reading ease, school grade, sentence length', icon: BookOpenCheck, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Write', id: 'cite', name: 'References', what: 'Sources in APA or MLA style', icon: Quote, tint: 'from-amber-500 to-orange-500' },
  { group: 'Write', id: 'speak', name: 'Read aloud', what: 'Listen to any text, choose the voice and speed', icon: Volume2, tint: 'from-violet-500 to-indigo-500' },
  { group: 'Write', id: 'dictate', name: 'Dictation', what: 'Speak and it is typed', icon: MicIcon, tint: 'from-pink-500 to-rose-500' },
  { group: 'Write', id: 'symbols', name: 'Symbols', what: 'Maths, Greek, money and marks to copy', icon: Omega, tint: 'from-zinc-500 to-indigo-500' },
  { group: 'Write', id: 'markdown', name: 'Markdown preview', what: 'Write Markdown, see the page, copy the HTML', icon: FileText, tint: 'from-zinc-500 to-zinc-700' },
  { group: 'PDF and files', id: 'pdf', name: 'Edit a PDF', what: 'Sign, fill in, reorder or remove pages', icon: FileText, tint: 'from-rose-500 to-amber-500' },
  { group: 'PDF and files', id: 'pdf-merge', name: 'Join PDFs', what: 'Put several PDFs together, in your order', icon: Combine, tint: 'from-rose-500 to-pink-500' },
  { group: 'PDF and files', id: 'pdf-split', name: 'Take pages out', what: 'Keep only the pages you pick from a PDF', icon: Scissors, tint: 'from-amber-500 to-rose-500' },
  { group: 'PDF and files', id: 'pdf-images', name: 'Pictures to PDF', what: 'Photos or scans into one PDF, a page each', icon: FileImage, tint: 'from-orange-500 to-amber-500' },
  { group: 'PDF and files', id: 'convert', name: 'Convert files', what: 'Word to PDF, PDF to pictures, Excel to CSV and more', icon: Repeat2, tint: 'from-indigo-500 to-sky-500' },
  { group: 'PDF and files', id: 'compress', name: 'Compress files', what: 'Make PDFs, photos, videos and documents smaller', icon: Minimize2, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Sheets and data', id: 'table', name: 'Table tools', what: 'Totals per column; CSV, JSON or Markdown', icon: Table2, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', id: 'calc', name: 'Calculator', what: 'Sums with brackets, powers and %, kept in a list', icon: Calculator, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Sheets and data', id: 'chart', name: 'Chart maker', what: 'Numbers into a bar or line chart picture', icon: ChartColumn, tint: 'from-violet-500 to-pink-500' },
  { group: 'Sheets and data', id: 'units', name: 'Unit converter', what: 'Length, weight, area, volume, speed, data, time, temperature', icon: Ruler, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'percent', name: 'Percentages', what: 'A% of B, what % is it, change between', icon: Percent, tint: 'from-lime-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'dates', name: 'Date calculator', what: 'Days and weekdays between dates, or days on', icon: CalendarRange, tint: 'from-sky-500 to-teal-500' },
  { group: 'Sheets and data', id: 'picker', name: 'Random picker and groups', what: 'Pick someone, or split a class into groups', icon: Shuffle, tint: 'from-pink-500 to-amber-500' },
  { group: 'Present', id: 'present', name: 'Quick presenter', what: 'Write slides as text, present full screen', icon: Presentation, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Present', id: 'timer', name: 'Countdown', what: 'A big timer for talks, tests and breaks', icon: Timer, tint: 'from-rose-500 to-orange-500' },
  { group: 'Present', id: 'img-quote', name: 'Quote cards', what: 'Words on a colour, for posts and slides', icon: MessageSquareQuote, tint: 'from-fuchsia-500 to-pink-500' },
  { group: 'Design and media', id: 'img-resize', name: 'Resize for social', what: 'Instagram, story, thumbnail, slide or A4', icon: Crop, tint: 'from-indigo-500 to-sky-500' },
  { group: 'Design and media', id: 'img-collage', name: 'Collage', what: 'Two to six photos in one picture', icon: LayoutGrid, tint: 'from-amber-500 to-pink-500' },
  { group: 'Design and media', id: 'img-avatar', name: 'Profile picture', what: 'A round photo with a coloured ring', icon: CircleUser, tint: 'from-pink-500 to-violet-500' },
  { group: 'Design and media', id: 'img-beautify', name: 'Screenshot frame', what: 'A screenshot on a colour with a window and shadow', icon: AppWindow, tint: 'from-sky-500 to-violet-500' },
  { group: 'Design and media', id: 'img-watermark', name: 'Watermark', what: 'Your name across a photo', icon: Stamp, tint: 'from-zinc-500 to-zinc-800' },
  { group: 'Design and media', id: 'contrast', name: 'Contrast checker', what: 'Can people read this text on that colour?', icon: Contrast, tint: 'from-zinc-700 to-pink-500' },
  { group: 'Design and media', id: 'colour', name: 'Colour codes', what: 'HEX, RGB and HSL of any colour', icon: Pipette, tint: 'from-teal-500 to-fuchsia-500' },
  { group: 'Design and media', id: 'photo', name: 'Edit a photo', what: 'Crop, adjust, text, remove a background; posts and posters', icon: Palette, tint: 'from-indigo-500 to-fuchsia-500' },
  { group: 'Design and media', id: 'colours', name: 'Colour palettes', what: 'Five colours that go together, or from a photo', icon: SwatchBook, tint: 'from-pink-500 to-fuchsia-500' },
  { group: 'Design and media', id: 'gradient', name: 'Gradients', what: 'Backgrounds for slides and designs, with CSS', icon: Sparkles, tint: 'from-fuchsia-500 to-sky-500' },
  { group: 'Design and media', id: 'qr', name: 'QR codes', what: 'A code for any link, ready to print', icon: QrCode, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Design and media', id: 'video', name: 'Edit a video', what: 'Trim, join clips, add text and music', icon: Clapperboard, tint: 'from-violet-500 to-sky-500' },
  { group: 'Design and media', id: 'record', name: 'Record the screen', what: 'A lesson, a demo or a bug, as a video', icon: MonitorPlay, tint: 'from-rose-500 to-violet-500' },
  { group: 'Design and media', id: 'audio', name: 'Edit sound', what: 'Record, trim and clean up audio', icon: AudioWaveform, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Code', id: 'json', name: 'JSON formatter', what: 'Check, tidy or squash JSON', icon: Braces, tint: 'from-sky-600 to-indigo-600' },
  { group: 'Code', id: 'regex', name: 'Regex tester', what: 'Try a pattern and see every match', icon: Regex, tint: 'from-teal-500 to-sky-600' },
  { group: 'Code', id: 'img-codeimg', name: 'Code picture', what: 'Code in an editor window, as an image', icon: FileCode2, tint: 'from-indigo-600 to-zinc-900' },
  { group: 'Code', id: 'hash', name: 'Fingerprints (SHA)', what: 'Check a file or text is exactly the same', icon: Fingerprint, tint: 'from-emerald-600 to-zinc-800' },
  { group: 'Code', id: 'uuid', name: 'Unique IDs', what: 'Random UUIDs, as many as you need', icon: Droplet, tint: 'from-sky-600 to-teal-600' },
  { group: 'Code', id: 'password', name: 'Password maker', what: 'Strong passwords, made on this device', icon: KeyRound, tint: 'from-amber-600 to-rose-600' },
  { group: 'Code', id: 'time', name: 'Timestamps', what: 'Unix time and dates, both ways', icon: Clock, tint: 'from-violet-600 to-sky-600' },
  { group: 'Code', id: 'url', name: 'Web address parts', what: 'A link taken apart, its query as a table', icon: Link2, tint: 'from-teal-600 to-indigo-600' },
  { group: 'Code', id: 'jwt', name: 'Token reader (JWT)', what: 'What a sign-in token says inside', icon: KeyRound, tint: 'from-zinc-600 to-violet-600' },
  { group: 'Code', id: 'encode', name: 'Encode and decode', what: 'Base64 and web addresses, both ways', icon: Rows3, tint: 'from-zinc-500 to-sky-600' },
];
const GROUPS = [...new Set(TOOLS.map((t) => t.group))];
/** Make something new (the old Docs and Whiteboards tabs, now here). */
const MAKE: { href: string; name: string; what: string; icon: LucideIcon }[] = [
  { href: '/docs', name: 'Documents, sheets and slides', what: 'Write, calculate and present, together', icon: FileStack },
  { href: '/boards', name: 'Whiteboards', what: 'Draw and plan together', icon: PenTool },
  { href: '/code', name: 'Code', what: 'Write and run code with others', icon: Code2 },
];

export default function ToolsPage() {
  return (
    <Suspense fallback={<><Topbar title="Create" /><CollabTabs /><div className="flex-1 p-8"><ContentSkeleton variant="grid" /></div></>}>
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
      <Topbar title="Create" subtitle="Documents, whiteboards and every tool: notes, PDFs, tables, design, media and code" />
      <CollabTabs />
      <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" aria-label="Choose a PDF to edit" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/*,image/*" multiple className="hidden" aria-label="Choose videos to edit" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) setVideo(fs); }} />
      {editor ?? (
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4">
            {panel ? (
              <>
                <button type="button" onClick={() => open(null)} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white min-h-11"><ArrowLeft className="w-4 h-4 rtl:rotate-180" aria-hidden />Everything in Create</button>
                {panel === 'convert' && <Converter onClose={() => open(null)} />}
                {panel === 'compress' && <Compressor onClose={() => open(null)} />}
                {panel === 'photo' && <PhotoStart onOpen={setDoc} />}
                {panel === 'audio' && <AudioStart onOpen={setAudio} />}
                {panel !== 'convert' && panel !== 'compress' && panel !== 'photo' && panel !== 'audio' && (
                  <section className="panel p-5 space-y-4" aria-labelledby="tool-title">
                    <h2 id="tool-title" className="font-bold text-zinc-900 dark:text-white">{TOOLS.find((t) => t.id === panel)?.name}</h2>
                    {panel === 'notes' ? <QuickNotes /> : panel.startsWith('pdf-') ? <PdfTool id={panel.slice(4) as PdfId} /> : panel.startsWith('img-') ? <ImageTool id={panel.slice(4) as ImageId} /> : (MORE as string[]).includes(panel) ? <MoreTool id={panel as MoreId} /> : <QuickTool id={panel as QuickId} />}
                  </section>
                )}
              </>
            ) : (
              <>
                <section aria-labelledby="make-h">
                  <h2 id="make-h" className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">Make something new</h2>
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {MAKE.map((m) => (
                      <li key={m.href}><Link href={m.href} className="flex items-center gap-3 rounded-3xl bg-pink-500/10 dark:bg-pink-500/15 border border-pink-500/25 p-4 hover:border-pink-500/60 transition-colors">
                        <m.icon className="w-6 h-6 shrink-0 text-pink-600 dark:text-pink-300" aria-hidden />
                        <span className="min-w-0"><span className="block font-bold text-zinc-900 dark:text-white">{m.name}</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">{m.what}</span></span>
                      </Link></li>
                    ))}
                  </ul>
                </section>
                {GROUPS.map((g) => (
                  <section key={g} aria-labelledby={`g-${g}`}>
                    <h2 id={`g-${g}`} className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">{g}</h2>
                    <motion.ul variants={list} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {TOOLS.filter((t) => t.group === g).map((t) => (
                        <motion.li key={t.id} variants={fadeUp}>
                          <button type="button" onClick={() => pick(t.id)} className="w-full h-full text-start rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 hover:border-indigo-400/60 transition-colors">
                            <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${t.tint} text-white grid place-items-center`}><t.icon className="w-5 h-5" aria-hidden /></span>
                            <span className="block mt-3 font-bold text-zinc-900 dark:text-white">{t.name}</span>
                            <span className="block mt-0.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">{t.what}</span>
                          </button>
                        </motion.li>
                      ))}
                    </motion.ul>
                  </section>
                ))}
              </>
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
