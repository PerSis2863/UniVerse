'use client';

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AnimatePresence, m as motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, AudioWaveform, Braces, CaseSensitive, Clapperboard, Code2, Combine, FileImage, FileStack, FileText, GitCompare, Hash, History, ImagePlus, Loader2, Mic, Minimize2, MonitorPlay, Music, NotebookPen, Palette, PenTool, QrCode, Regex, Repeat2, Rows3, Scissors, Sparkles, SwatchBook, Table2, type LucideIcon } from 'lucide-react';
import Link from '@/components/ui/Link';
import type { QuickId } from '@/components/studio/QuickTools';
import type { PdfId } from '@/components/studio/PdfTools';
import type { MoreId } from '@/components/studio/MoreTools';
import type { ImageId } from '@/components/studio/ImageTools';
import type { PlanId } from '@/components/studio/PlanTools';
import type { StudyId } from '@/components/studio/StudyTools';
import type { DataId } from '@/components/studio/DataTools';
import type { MakerId } from '@/components/studio/MakerTools';
import { Award, AudioLines, Barcode, CalendarCheck, CalendarClock, CalendarDays, ChartGantt, ChartSpline, ClipboardList, Cloud, CodeXml, Disc3, Earth, EyeOff, Film, GraduationCap, Grid3x3, IdCard, Layers, ListTree, Network, Receipt, Scale, ScrollText, Search, Sigma, Signature, Star, StickyNote, TableProperties, Wallet, Workflow, X } from 'lucide-react';
import { AppWindow, BookOpenCheck, Calculator, CalendarRange, ChartColumn, CircleUser, Clock, Contrast, Crop, Droplet, FileCode2, Fingerprint, KeyRound, LayoutGrid, Link2, MessageSquareQuote, Mic as MicIcon, Omega, Percent, Pipette, Presentation, Quote, Replace, Ruler, Shuffle, Stamp, Timer, Volume2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CollabTabs } from '@/components/layout/SectionTabs';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { SIZES } from '@/lib/studio';
import { fadeUp, list, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
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

// Each set of tools is its own download, fetched when a tool is opened, or a moment before: when the
// pointer rests on its card (M72), so tools open at once.
const LOAD = {
  quick: () => import('@/components/studio/QuickTools'),
  pdf: () => import('@/components/studio/PdfTools'),
  more: () => import('@/components/studio/MoreTools'),
  image: () => import('@/components/studio/ImageTools'),
  notes: () => import('@/components/studio/QuickNotes'),
  plan: () => import('@/components/studio/PlanTools'),
  study: () => import('@/components/studio/StudyTools'),
  data: () => import('@/components/studio/DataTools'),
  maker: () => import('@/components/studio/MakerTools'),
};
const toolLoading = () => <div className="h-48 rounded-2xl skeleton" />;
const QuickTool = dynamic(() => LOAD.quick().then((m) => m.QuickTool), { ssr: false, loading: toolLoading });
const PdfTool = dynamic(() => LOAD.pdf().then((m) => m.PdfTool), { ssr: false, loading: toolLoading });
const MoreTool = dynamic(() => LOAD.more().then((m) => m.MoreTool), { ssr: false, loading: toolLoading });
const ImageTool = dynamic(() => LOAD.image().then((m) => m.ImageTool), { ssr: false, loading: toolLoading });
const QuickNotes = dynamic(() => LOAD.notes().then((m) => m.QuickNotes), { ssr: false, loading: toolLoading });
const PlanTool = dynamic(() => LOAD.plan().then((m) => m.PlanTool), { ssr: false, loading: toolLoading });
const StudyTool = dynamic(() => LOAD.study().then((m) => m.StudyTool), { ssr: false, loading: toolLoading });
const DataTool = dynamic(() => LOAD.data().then((m) => m.DataTool), { ssr: false, loading: toolLoading });
const MakerTool = dynamic(() => LOAD.maker().then((m) => m.MakerTool), { ssr: false, loading: toolLoading });

type Pdf3 = `pdf-${PdfId}`;
type Panel = 'convert' | 'compress' | 'photo' | 'audio' | 'notes' | QuickId | Pdf3 | MoreId | `img-${ImageId}` | PlanId | StudyId | DataId | MakerId;
// M71: the second set (28 more tools).
const MORE: MoreId[] = ['replace', 'read', 'cite', 'speak', 'dictate', 'symbols', 'calc', 'units', 'percent', 'picker', 'chart', 'dates', 'present', 'timer', 'contrast', 'colour', 'hash', 'uuid', 'password', 'time', 'url', 'jwt'];
const IMAGES: ImageId[] = ['resize', 'quote', 'collage', 'avatar', 'beautify', 'codeimg', 'watermark'];
const QUICK: QuickId[] = ['words', 'clean', 'compare', 'table', 'colours', 'gradient', 'json', 'regex', 'markdown', 'encode', 'qr', 'record'];
// M72: thirty bigger tools, in four sets.
const PLAN: PlanId[] = ['mindmap', 'outline', 'stickies', 'gantt', 'timetable', 'habits', 'decide', 'flow'];
const STUDY: StudyId[] = ['cards', 'gpa', 'studyplan', 'rubric', 'wordsearch', 'certificate', 'wheel', 'noise'];
const DATA: DataId[] = ['graph', 'stats', 'explore', 'budget', 'invoice', 'zones'];
const MAKER: MakerId[] = ['cv', 'cloud', 'prompter', 'playground', 'barcode', 'redact', 'slideshow', 'signature'];
const PANELS: Panel[] = ['convert', 'compress', 'photo', 'audio', 'notes', ...QUICK, 'pdf-merge', 'pdf-split', 'pdf-images', ...MORE, ...IMAGES.map((i) => `img-${i}` as const), ...PLAN, ...STUDY, ...DATA, ...MAKER];
/** Tools that need the whole width (boards, timelines, editors with a preview). */
const WIDE = new Set<string>(['mindmap', 'stickies', 'gantt', 'timetable', 'flow', 'cv', 'playground', 'explore', 'zones', 'wordsearch', 'rubric', 'graph', 'habits']);
const setOf = (id: string): keyof typeof LOAD | null =>
  id === 'notes' ? 'notes' : id.startsWith('pdf-') ? 'pdf' : id.startsWith('img-') ? 'image' : (MORE as string[]).includes(id) ? 'more' : (QUICK as string[]).includes(id) ? 'quick'
    : (PLAN as string[]).includes(id) ? 'plan' : (STUDY as string[]).includes(id) ? 'study' : (DATA as string[]).includes(id) ? 'data' : (MAKER as string[]).includes(id) ? 'maker' : null;
const preload = (id: string) => { const k = setOf(id); if (k) void LOAD[k]().catch(() => {}); };

interface Tool { id: Panel | 'pdf' | 'video'; name: string; what: string; icon: LucideIcon; tint: string; group: string; fresh?: boolean }
const TOOLS: Tool[] = [
  { group: 'Plan and organise', fresh: true, id: 'mindmap', name: 'Mind map', what: 'Ideas branching out; keyboard-fast, save as a picture', icon: Network, tint: 'from-violet-500 to-pink-500' },
  { group: 'Plan and organise', fresh: true, id: 'outline', name: 'Outliner', what: 'Nested bullet points that fold, move and tick off', icon: ListTree, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Plan and organise', fresh: true, id: 'stickies', name: 'Sticky-note wall', what: 'Brainstorm: drag notes around, colour and vote', icon: StickyNote, tint: 'from-amber-400 to-pink-500' },
  { group: 'Plan and organise', fresh: true, id: 'gantt', name: 'Timeline (Gantt)', what: 'Tasks as bars over the days, with today marked', icon: ChartGantt, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Plan and organise', fresh: true, id: 'flow', name: 'Flowchart', what: 'Write “A -> B” and the chart draws itself', icon: Workflow, tint: 'from-teal-500 to-sky-500' },
  { group: 'Plan and organise', fresh: true, id: 'timetable', name: 'Timetable maker', what: 'A weekly timetable, coloured by subject, to print', icon: CalendarDays, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Plan and organise', fresh: true, id: 'habits', name: 'Habit tracker', what: 'Tick each day and keep your streak going', icon: CalendarCheck, tint: 'from-pink-500 to-rose-500' },
  { group: 'Plan and organise', fresh: true, id: 'decide', name: 'Decision helper', what: 'Score your choices on what matters most', icon: Scale, tint: 'from-amber-500 to-orange-500' },
  { group: 'Plan and organise', fresh: true, id: 'zones', name: 'World clock', what: 'Times around the world and hours that suit everyone', icon: Earth, tint: 'from-sky-500 to-teal-500' },
  { group: 'Study and teach', fresh: true, id: 'cards', name: 'Flashcards', what: 'Decks that bring back what you keep forgetting', icon: Layers, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Study and teach', fresh: true, id: 'studyplan', name: 'Revision planner', what: 'Exam dates into a day-by-day plan, for your calendar', icon: CalendarClock, tint: 'from-violet-500 to-sky-500' },
  { group: 'Study and teach', fresh: true, id: 'gpa', name: 'Grades and GPA', what: 'Your average, GPA, and what you need on the rest', icon: GraduationCap, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Study and teach', fresh: true, id: 'rubric', name: 'Rubric maker', what: 'Criteria and levels; click to mark a piece of work', icon: ClipboardList, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Study and teach', fresh: true, id: 'wordsearch', name: 'Word search', what: 'Make one to print, or play it here', icon: Grid3x3, tint: 'from-amber-500 to-rose-500' },
  { group: 'Study and teach', fresh: true, id: 'certificate', name: 'Certificate maker', what: 'Awards with a name, reason and signature line', icon: Award, tint: 'from-amber-500 to-yellow-500' },
  { group: 'Study and teach', fresh: true, id: 'wheel', name: 'Spin the wheel', what: 'Pick a name with a spin the whole class can watch', icon: Disc3, tint: 'from-pink-500 to-violet-500' },
  { group: 'Study and teach', fresh: true, id: 'noise', name: 'Noise meter', what: 'How loud is the room? A dial with a limit you set', icon: AudioLines, tint: 'from-rose-500 to-orange-500' },

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
  { group: 'Write', fresh: true, id: 'cv', name: 'CV builder', what: 'Fill it in, see the page, save it as a PDF', icon: IdCard, tint: 'from-indigo-500 to-sky-500' },
  { group: 'Write', id: 'markdown', name: 'Markdown preview', what: 'Write Markdown, see the page, copy the HTML', icon: FileText, tint: 'from-zinc-500 to-zinc-700' },
  { group: 'PDF and files', id: 'pdf', name: 'Edit a PDF', what: 'Sign, fill in, reorder or remove pages', icon: FileText, tint: 'from-rose-500 to-amber-500' },
  { group: 'PDF and files', id: 'pdf-merge', name: 'Join PDFs', what: 'Put several PDFs together, in your order', icon: Combine, tint: 'from-rose-500 to-pink-500' },
  { group: 'PDF and files', id: 'pdf-split', name: 'Take pages out', what: 'Keep only the pages you pick from a PDF', icon: Scissors, tint: 'from-amber-500 to-rose-500' },
  { group: 'PDF and files', id: 'pdf-images', name: 'Pictures to PDF', what: 'Photos or scans into one PDF, a page each', icon: FileImage, tint: 'from-orange-500 to-amber-500' },
  { group: 'PDF and files', id: 'convert', name: 'Convert files', what: 'Word to PDF, PDF to pictures, Excel to CSV and more', icon: Repeat2, tint: 'from-indigo-500 to-sky-500' },
  { group: 'PDF and files', id: 'compress', name: 'Compress files', what: 'Make PDFs, photos, videos and documents smaller', icon: Minimize2, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Sheets and data', id: 'table', name: 'Table tools', what: 'Totals per column; CSV, JSON or Markdown', icon: Table2, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', fresh: true, id: 'explore', name: 'Data explorer', what: 'Open a CSV: sort, filter and total by group', icon: TableProperties, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Sheets and data', fresh: true, id: 'graph', name: 'Graph plotter', what: 'Draw y = 2x + 1, sin(x)… drag and zoom', icon: ChartSpline, tint: 'from-violet-500 to-indigo-500' },
  { group: 'Sheets and data', fresh: true, id: 'stats', name: 'Statistics', what: 'Mean, median, mode, spread and a histogram', icon: Sigma, tint: 'from-sky-500 to-violet-500' },
  { group: 'Sheets and data', fresh: true, id: 'budget', name: 'Budget planner', what: 'Money in and out, and where it goes', icon: Wallet, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', fresh: true, id: 'invoice', name: 'Invoice maker', what: 'Items, tax and discount; print or save as PDF', icon: Receipt, tint: 'from-zinc-500 to-indigo-500' },
  { group: 'Sheets and data', id: 'calc', name: 'Calculator', what: 'Sums with brackets, powers and %, kept in a list', icon: Calculator, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Sheets and data', id: 'chart', name: 'Chart maker', what: 'Numbers into a bar or line chart picture', icon: ChartColumn, tint: 'from-violet-500 to-pink-500' },
  { group: 'Sheets and data', id: 'units', name: 'Unit converter', what: 'Length, weight, area, volume, speed, data, time, temperature', icon: Ruler, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'percent', name: 'Percentages', what: 'A% of B, what % is it, change between', icon: Percent, tint: 'from-lime-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'dates', name: 'Date calculator', what: 'Days and weekdays between dates, or days on', icon: CalendarRange, tint: 'from-sky-500 to-teal-500' },
  { group: 'Sheets and data', id: 'picker', name: 'Random picker and groups', what: 'Pick someone, or split a class into groups', icon: Shuffle, tint: 'from-pink-500 to-amber-500' },
  { group: 'Present', id: 'present', name: 'Quick presenter', what: 'Write slides as text, present full screen', icon: Presentation, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Present', fresh: true, id: 'prompter', name: 'Teleprompter', what: 'Your script scrolls by itself, big and steady', icon: ScrollText, tint: 'from-zinc-700 to-pink-500' },
  { group: 'Present', id: 'timer', name: 'Countdown', what: 'A big timer for talks, tests and breaks', icon: Timer, tint: 'from-rose-500 to-orange-500' },
  { group: 'Present', id: 'img-quote', name: 'Quote cards', what: 'Words on a colour, for posts and slides', icon: MessageSquareQuote, tint: 'from-fuchsia-500 to-pink-500' },
  { group: 'Design and media', fresh: true, id: 'slideshow', name: 'Slideshow video', what: 'Pictures into a video with soft fades', icon: Film, tint: 'from-violet-500 to-pink-500' },
  { group: 'Design and media', fresh: true, id: 'redact', name: 'Hide parts of a picture', what: 'Blur, pixelate or black out names and faces', icon: EyeOff, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Design and media', fresh: true, id: 'signature', name: 'Signature pad', what: 'Sign with a finger or pen; a see-through PNG', icon: Signature, tint: 'from-indigo-600 to-sky-500' },
  { group: 'Design and media', fresh: true, id: 'cloud', name: 'Word cloud', what: 'The words used most, bigger the more they appear', icon: Cloud, tint: 'from-sky-400 to-pink-500' },
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
  { group: 'Design and media', fresh: true, id: 'barcode', name: 'Barcodes', what: 'Code 128 bars for labels, stock and tickets', icon: Barcode, tint: 'from-zinc-700 to-zinc-900' },
  { group: 'Design and media', id: 'qr', name: 'QR codes', what: 'A code for any link, ready to print', icon: QrCode, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Design and media', id: 'video', name: 'Edit a video', what: 'Trim, join clips, add text and music', icon: Clapperboard, tint: 'from-violet-500 to-sky-500' },
  { group: 'Design and media', id: 'record', name: 'Record the screen', what: 'A lesson, a demo or a bug, as a video', icon: MonitorPlay, tint: 'from-rose-500 to-violet-500' },
  { group: 'Design and media', id: 'audio', name: 'Edit sound', what: 'Record, trim and clean up audio', icon: AudioWaveform, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Code', fresh: true, id: 'playground', name: 'Code playground', what: 'HTML, CSS and JavaScript with a live page', icon: CodeXml, tint: 'from-pink-500 to-indigo-600' },
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
const ORDER = ['Write', 'Plan and organise', 'Study and teach', 'PDF and files', 'Sheets and data', 'Present', 'Design and media', 'Code'];
const GROUPS = ORDER.filter((g) => TOOLS.some((t) => t.group === g));
const BY_ID = new Map(TOOLS.map((t) => [t.id as string, t]));
const slug = (g: string) => `g-${g.toLowerCase().replace(/\W+/g, '-')}`;

// Recent and starred tools, kept on this device. Read through useSyncExternalStore so the first paint
// matches the server (empty) and every list on the page updates together.
const listeners = new Set<() => void>();
function useToolList(key: string) {
  const raw = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => { try { return localStorage.getItem(key) ?? '[]'; } catch { return '[]'; } }, () => '[]');
  const ids = useMemo(() => { try { return (JSON.parse(raw) as string[]).filter((id) => BY_ID.has(id)); } catch { return []; } }, [raw]);
  const set = (next: string[]) => { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private window */ } listeners.forEach((f) => f()); };
  return [ids, set] as const;
}
const matches = (t: Tool, q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => `${t.name} ${t.what} ${t.group}`.toLowerCase().includes(w));
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
  const [recent, setRecent] = useToolList('uv-create-recent');
  const [stars, setStars] = useToolList('uv-create-stars');
  const pdfRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  // M72: the list keeps its place: going back to it scrolls to where you were.
  const scroller = useRef<HTMLDivElement>(null);
  const gridTop = useRef(0);
  const calm = useReducedMotion();
  const open = (p: Panel | null) => {
    if (p) { if (!panel) gridTop.current = scroller.current?.scrollTop ?? 0; setRecent([p, ...recent.filter((r) => r !== p)].slice(0, 6)); }
    router.push(p ? `/studio?tool=${p}` : '/studio', { scroll: false });
  };
  const pick = (t: Tool['id']) => (t === 'pdf' ? pdfRef.current?.click() : t === 'video' ? videoRef.current?.click() : open(t));
  const star = (id: string) => setStars(stars.includes(id) ? stars.filter((s) => s !== id) : [id, ...stars]);
  // Esc goes back to the list (not while typing, and not when a full-screen view is open).
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || e.defaultPrevented || document.fullscreenElement || document.querySelector('[aria-modal="true"]') || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      router.push('/studio', { scroll: false });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, router]);

  const editor = video ? <VideoEditor key={video.map((f) => f.name + f.size).join('|')} files={video} onClose={() => setVideo(null)} />
    : audio ? <AudioEditor key={audio === 'record' ? 'record' : audio.name + audio.size} file={audio === 'record' ? null : audio} onClose={() => setAudio(null)} />
    : pdf ? <PdfEditor key={pdf.name + pdf.size} file={pdf} onClose={() => setPdf(null)} />
    : doc ? <PhotoEditor key={`${doc.name}-${doc.w}-${doc.h}`} initial={doc} onClose={() => setDoc(null)} />
    : null;
  const info = panel ? BY_ID.get(panel) : undefined;
  const set = panel ? setOf(panel) : null;
  // Arrivals glide up a little; leaving is quicker. With Reduce Motion: fades only.
  const enter = calm ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 };
  const leave = calm ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, y: -6, scale: 0.995, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] as const } };

  return (
    <>
      <Topbar title="Create" subtitle="Documents, whiteboards and every tool: notes, planning, study, PDFs, data, design, media and code" />
      <CollabTabs />
      <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" aria-label="Choose a PDF to edit" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/*,image/*" multiple className="hidden" aria-label="Choose videos to edit" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) setVideo(fs); }} />
      {editor ?? (
        <div ref={scroller} className="flex-1 p-4 md:p-8 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            {panel ? (
              <motion.div key={panel} initial={enter} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.smooth }} exit={leave} className={cn('mx-auto space-y-4', WIDE.has(panel) ? 'max-w-6xl' : 'max-w-4xl')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => open(null)} className="group inline-flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white min-h-11"><ArrowLeft className="w-4 h-4 rtl:rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" aria-hidden />Everything in Create</button>
                  {info && <StarButton on={stars.includes(panel)} name={info.name} onClick={() => star(panel)} solid />}
                </div>
                {panel === 'convert' && <Converter onClose={() => open(null)} />}
                {panel === 'compress' && <Compressor onClose={() => open(null)} />}
                {panel === 'photo' && <PhotoStart onOpen={setDoc} />}
                {panel === 'audio' && <AudioStart onOpen={setAudio} />}
                {set && (
                  <section className="panel p-5 space-y-4" aria-labelledby="tool-title">
                    <div className="flex items-center gap-3">
                      {info && <span className={`w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br ${info.tint} text-white grid place-items-center`}><info.icon className="w-5 h-5" aria-hidden /></span>}
                      <div className="min-w-0"><h2 id="tool-title" className="font-bold text-zinc-900 dark:text-white">{info?.name}</h2>{info && <p className="text-xs text-zinc-600 dark:text-zinc-300">{info.what}</p>}</div>
                    </div>
                    {set === 'notes' ? <QuickNotes />
                      : set === 'pdf' ? <PdfTool id={panel.slice(4) as PdfId} />
                      : set === 'image' ? <ImageTool id={panel.slice(4) as ImageId} />
                      : set === 'more' ? <MoreTool id={panel as MoreId} />
                      : set === 'plan' ? <PlanTool id={panel as PlanId} />
                      : set === 'study' ? <StudyTool id={panel as StudyId} />
                      : set === 'data' ? <DataTool id={panel as DataId} />
                      : set === 'maker' ? <MakerTool id={panel as MakerId} />
                      : <QuickTool id={panel as QuickId} />}
                  </section>
                )}
              </motion.div>
            ) : (
              <motion.div key="grid" initial={enter} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.smooth }} exit={leave} className="max-w-5xl mx-auto">
                <Hub recent={recent} stars={stars} onPick={pick} onStar={star} onMount={() => { if (scroller.current) scroller.current.scrollTop = gridTop.current; }} calm={!!calm} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

function StarButton({ on, name, onClick, solid }: { on: boolean; name: string; onClick: () => void; solid?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={solid ? undefined : `Star ${name}`} title={on ? 'Starred: shown at the top' : 'Star: keep it at the top'}
      className={cn('inline-flex items-center gap-1.5 rounded-full transition-[transform,background-color,color] duration-200 active:scale-90', solid ? 'btn-secondary btn-sm' : 'w-9 h-9 justify-center', on ? 'text-pink-600 dark:text-pink-300' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white')}>
      <motion.span key={String(on)} initial={on ? { scale: 0.85 } : false} animate={{ scale: 1 }} transition={spring.bouncy} className="inline-flex"><Star className={cn('w-4 h-4', on && 'fill-current')} aria-hidden /></motion.span>
      {solid && (on ? 'Starred' : 'Star')}
    </button>
  );
}

/** One tool's card: it starts loading the tool as soon as the pointer rests on it. */
function ToolCard({ t, starred, onPick, onStar }: { t: Tool; starred: boolean; onPick: (id: Tool['id']) => void; onStar: (id: string) => void }) {
  return (
    <div className="group relative h-full">
      <button type="button" onClick={() => onPick(t.id)} onPointerEnter={() => preload(t.id)} onFocus={() => preload(t.id)}
        className="w-full h-full text-start rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-5 transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-indigo-400/60 hover:shadow-lg hover:shadow-indigo-900/10 active:scale-[0.98] active:duration-100 motion-reduce:transform-none">
        <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${t.tint} text-white grid place-items-center transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-[1.06] group-hover:-rotate-3 motion-reduce:transform-none`}><t.icon className="w-5 h-5" aria-hidden /></span>
        <span className="mt-3 flex items-center gap-1.5 pe-8 font-bold text-zinc-900 dark:text-white">{t.name}{t.fresh && <span className="rounded-full bg-pink-500 px-1.5 py-px text-[11px] font-bold text-indigo-900">New</span>}</span>
        <span className="block mt-0.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">{t.what}</span>
      </button>
      <span className={cn('absolute top-2.5 end-2.5 transition-opacity duration-200 [@media(hover:none)]:opacity-100', starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
        <StarButton on={starred} name={t.name} onClick={() => onStar(t.id)} />
      </span>
    </div>
  );
}

/** The list of everything in Create: search, starred and recent tools, then every group. */
function Hub({ recent, stars, onPick, onStar, onMount, calm }: { recent: string[]; stars: string[]; onPick: (id: Tool['id']) => void; onStar: (id: string) => void; onMount: () => void; calm: boolean }) {
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const mounted = useRef(onMount);
  useLayoutEffect(() => { mounted.current(); }, []);
  // "/" jumps to the search box, like most apps.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const el = e.target as HTMLElement | null; if (e.key === '/' && !el?.closest('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const found = q.trim() ? TOOLS.filter((t) => matches(t, q)) : null;
  const card = (t: Tool) => <ToolCard t={t} starred={stars.includes(t.id)} onPick={onPick} onStar={onStar} />;
  const shelf = (title: string, ids: string[]) => ids.length > 0 && (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">{title}</h2>
      <ul className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence initial={false}>
          {ids.map((id) => BY_ID.get(id)!).map((t) => <motion.li key={t.id} layout={!calm} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }} transition={spring.smooth}>{card(t)}</motion.li>)}
        </AnimatePresence>
      </ul>
    </section>
  );
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search the tools</span>
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 pointer-events-none" aria-hidden />
          <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); if (e.key === 'Enter' && found?.[0]) onPick(found[0].id); }}
            placeholder={`Search ${TOOLS.length} tools: “pdf”, “flashcards”, “graph”…`} className="input w-full rounded-full ps-11! pe-14! py-3 text-base" />
          {q ? <button type="button" onClick={() => { setQ(''); search.current?.focus(); }} aria-label="Clear the search" className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" aria-hidden /></button>
            : <kbd className="absolute end-4 top-1/2 -translate-y-1/2 hidden sm:block rounded-md border border-zinc-300 dark:border-white/15 px-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-300">/</kbd>}
        </label>
        {!found && (
          <nav aria-label="Jump to a group" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {GROUPS.map((g) => <button key={g} type="button" onClick={() => document.getElementById(slug(g))?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })} className="shrink-0 rounded-full border border-zinc-200 dark:border-white/10 px-3 py-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-100 hover:border-indigo-400/60 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">{g}</button>)}
          </nav>
        )}
      </div>
      {found ? (
        <section aria-label="Search results" className="space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-300" role="status">{found.length ? `${found.length} ${found.length === 1 ? 'tool' : 'tools'}${found.length ? ' · Enter opens the first' : ''}` : 'Nothing matches. Try another word.'}</p>
          <motion.ul layout={!calm} className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {found.map((t) => <motion.li key={t.id} layout={!calm} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }} transition={spring.smooth}>{card(t)}</motion.li>)}
            </AnimatePresence>
          </motion.ul>
        </section>
      ) : (
        <>
          <section aria-labelledby="make-h">
            <h2 id="make-h" className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">Make something new</h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {MAKE.map((m) => (
                <li key={m.href}><Link href={m.href} className="group flex items-center gap-3 rounded-3xl bg-pink-500/10 dark:bg-pink-500/15 border border-pink-500/25 p-4 hover:border-pink-500/60 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transform-none">
                  <m.icon className="w-6 h-6 shrink-0 text-pink-600 dark:text-pink-300 transition-transform duration-300 group-hover:scale-110" aria-hidden />
                  <span className="min-w-0"><span className="block font-bold text-zinc-900 dark:text-white">{m.name}</span><span className="block text-xs text-zinc-600 dark:text-zinc-300">{m.what}</span></span>
                </Link></li>
              ))}
            </ul>
          </section>
          {shelf('Starred', stars)}
          {shelf('Used lately', recent.filter((r) => !stars.includes(r)).slice(0, 3))}
          {GROUPS.map((g) => (
            <section key={g} id={slug(g)} aria-labelledby={`${slug(g)}-h`} className="scroll-mt-4">
              <h2 id={`${slug(g)}-h`} className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">{g} <span className="font-normal text-zinc-600 dark:text-zinc-300 tabular-nums">· {TOOLS.filter((t) => t.group === g).length}</span></h2>
              <motion.ul variants={list} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {TOOLS.filter((t) => t.group === g).map((t) => <motion.li key={t.id} variants={fadeUp}>{card(t)}</motion.li>)}
              </motion.ul>
            </section>
          ))}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Everything runs in your browser: your files stay on this device until you save or share them.</p>
        </>
      )}
    </div>
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
