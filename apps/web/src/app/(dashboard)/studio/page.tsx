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
import type { WordId } from '@/components/studio/WordTools';
import type { OrganiseId } from '@/components/studio/OrganiseTools';
import type { ClassId } from '@/components/studio/ClassTools';
import type { MoneyId } from '@/components/studio/MoneyTools';
import type { MediaId } from '@/components/studio/MediaTools';
import type { DevId } from '@/components/studio/DevTools';
import type { PenId } from '@/components/studio/PenTools';
import type { LifeId } from '@/components/studio/LifeTools';
import type { ScienceId } from '@/components/studio/ScienceTools';
import type { CalcId } from '@/components/studio/CalcTools';
import type { StageId } from '@/components/studio/StageTools';
import type { ArtId } from '@/components/studio/ArtTools';
import type { WebId } from '@/components/studio/WebTools';
import { PenLine, Lightbulb, Feather, AlignLeft, TextCursorInput, BookA, NotebookTabs, MessagesSquare, SquareKanban, PartyPopper, Plane, Repeat, Sun, Table, Moon, Goal, Gift, Asterisk, SpellCheck, AlarmClock, MoveHorizontal, Blend, Milestone, ChartBarBig, Radius, Triangle, Brackets, FlaskConical, Magnet, TrendingUp, UsersRound, Fuel, Banknote, CookingPot, BriefcaseBusiness, BadgePercent, Ticket, Gamepad2, Contact, Hand, Megaphone, CreditCard, Paintbrush, ALargeSmall, Droplets, Terminal, Music4, Piano, Columns3, Database, FileJson, Share2, Lock, AlignHorizontalSpaceAround, Router } from 'lucide-react';
import { Check, ChevronLeft, ChevronRight, Expand, Aperture, Armchair, Atom, Binary, BookHeart, BookMarked, Brush, Cake, CalendarFold, CaseUpper, CircleHelp, Code, DatabaseZap, Dice5, Divide, Drum, Eye, Grid2x2, Guitar, HandCoins, Headphones, HeartPulse, Hourglass, Keyboard, Landmark, LayoutDashboard, Laugh, ListChecks, ListOrdered, ListTodo, Mail, PiggyBank, Pilcrow, Puzzle, Radio, ScanText, Server, Shapes, ShieldCheck, Smartphone, Split, SquareDashed, SquareFunction, Tag, Target, ThumbsUp, TimerReset, TrafficCone, Trophy, Type, Users, Variable, Vote, Watch, WholeWord, Zap } from 'lucide-react';
import { Award, AudioLines, Barcode, CalendarCheck, CalendarClock, CalendarDays, ChartGantt, ChartSpline, ClipboardList, Cloud, CodeXml, Disc3, Earth, EyeOff, Film, GraduationCap, Grid3x3, IdCard, Layers, ListTree, Network, Receipt, Scale, ScrollText, Search, Sigma, Signature, Star, StickyNote, TableProperties, Wallet, Workflow, X } from 'lucide-react';
import { AppWindow, BookOpenCheck, Calculator, CalendarRange, ChartColumn, CircleUser, Clock, Contrast, Crop, Droplet, FileCode2, Fingerprint, KeyRound, LayoutGrid, Link2, MessageSquareQuote, Mic as MicIcon, Omega, Percent, Pipette, Presentation, Quote, Replace, Ruler, Shuffle, Stamp, Timer, Volume2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { CollabTabs } from '@/components/layout/SectionTabs';
import { KeptScope } from '@/components/studio/kept';
import { keepShared, loadSave, loadShared, SaveButtons, SavedShelf, type Current, type Shared } from '@/components/studio/Saves';
import { isToken } from '@/lib/tool-saves';
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
  word: () => import('@/components/studio/WordTools'),
  organise: () => import('@/components/studio/OrganiseTools'),
  class: () => import('@/components/studio/ClassTools'),
  money: () => import('@/components/studio/MoneyTools'),
  media: () => import('@/components/studio/MediaTools'),
  dev: () => import('@/components/studio/DevTools'),
  pen: () => import('@/components/studio/PenTools'),
  life: () => import('@/components/studio/LifeTools'),
  science: () => import('@/components/studio/ScienceTools'),
  calc: () => import('@/components/studio/CalcTools'),
  stage: () => import('@/components/studio/StageTools'),
  art: () => import('@/components/studio/ArtTools'),
  web: () => import('@/components/studio/WebTools'),
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
const WordTool = dynamic(() => LOAD.word().then((m) => m.WordTool), { ssr: false, loading: toolLoading });
const OrganiseTool = dynamic(() => LOAD.organise().then((m) => m.OrganiseTool), { ssr: false, loading: toolLoading });
const ClassTool = dynamic(() => LOAD.class().then((m) => m.ClassTool), { ssr: false, loading: toolLoading });
const MoneyTool = dynamic(() => LOAD.money().then((m) => m.MoneyTool), { ssr: false, loading: toolLoading });
const MediaTool = dynamic(() => LOAD.media().then((m) => m.MediaTool), { ssr: false, loading: toolLoading });
const DevTool = dynamic(() => LOAD.dev().then((m) => m.DevTool), { ssr: false, loading: toolLoading });
const WritingTool = dynamic(() => LOAD.pen().then((m) => m.PenTool), { ssr: false, loading: toolLoading });
const LifeTool = dynamic(() => LOAD.life().then((m) => m.LifeTool), { ssr: false, loading: toolLoading });
const ScienceTool = dynamic(() => LOAD.science().then((m) => m.ScienceTool), { ssr: false, loading: toolLoading });
const CalcTool = dynamic(() => LOAD.calc().then((m) => m.CalcTool), { ssr: false, loading: toolLoading });
const StageTool = dynamic(() => LOAD.stage().then((m) => m.StageTool), { ssr: false, loading: toolLoading });
const ArtTool = dynamic(() => LOAD.art().then((m) => m.ArtTool), { ssr: false, loading: toolLoading });
const WebTool = dynamic(() => LOAD.web().then((m) => m.WebTool), { ssr: false, loading: toolLoading });

type Pdf3 = `pdf-${PdfId}`;
type Panel = 'convert' | 'compress' | 'photo' | 'audio' | 'notes' | QuickId | Pdf3 | MoreId | `img-${ImageId}` | PlanId | StudyId | DataId | MakerId | WordId | OrganiseId | ClassId | MoneyId | MediaId | DevId | PenId | LifeId | ScienceId | CalcId | StageId | ArtId | WebId;
// M71: the second set (28 more tools).
const MORE: MoreId[] = ['replace', 'read', 'cite', 'speak', 'dictate', 'symbols', 'calc', 'units', 'percent', 'picker', 'chart', 'dates', 'present', 'timer', 'contrast', 'colour', 'hash', 'uuid', 'password', 'time', 'url', 'jwt'];
const IMAGES: ImageId[] = ['resize', 'quote', 'collage', 'avatar', 'beautify', 'codeimg', 'watermark'];
const QUICK: QuickId[] = ['words', 'clean', 'compare', 'table', 'colours', 'gradient', 'json', 'regex', 'markdown', 'encode', 'qr', 'record'];
// M72: thirty bigger tools, in four sets.
const PLAN: PlanId[] = ['mindmap', 'outline', 'stickies', 'gantt', 'timetable', 'habits', 'decide', 'flow'];
const STUDY: StudyId[] = ['cards', 'gpa', 'studyplan', 'rubric', 'wordsearch', 'certificate', 'wheel', 'noise'];
const DATA: DataId[] = ['graph', 'stats', 'explore', 'budget', 'invoice', 'zones'];
const MAKER: MakerId[] = ['cv', 'cloud', 'prompter', 'playground', 'barcode', 'redact', 'slideshow', 'signature'];
// M74: 56 more, in six sets.
const WORD: WordId[] = ['lorem', 'morse', 'numwords', 'roman', 'letters', 'lines', 'fancy', 'journal', 'wordplay'];
const ORGANISE: OrganiseId[] = ['matrix', 'countdowns', 'meeting', 'checklists', 'goals', 'week', 'swot', 'proscons', 'reading', 'stopwatch', 'poll', 'agenda'];
const CLASS: ClassId[] = ['drill', 'periodic', 'quiz', 'seating', 'dice', 'fractions', 'equation', 'shapes', 'numfacts', 'traffic', 'scoreboard'];
const MONEY: MoneyId[] = ['loan', 'savings', 'price', 'age', 'bmi', 'split'];
const MEDIA: MediaId[] = ['booth', 'icon', 'meme', 'colourblind', 'pixel', 'cleanphoto', 'metronome', 'tuner', 'focus'];
const DEV: DevId[] = ['base', 'names', 'shadow', 'cron', 'escape', 'chars', 'status', 'keys', 'mock'];
// M75: 55 more, in seven sets.
const PEN: PenId[] = ['essay', 'prompts', 'poem', 'acrostic', 'typing', 'glossary', 'cornell', 'interview'];
const LIFE: LifeId[] = ['kanban', 'event', 'trip', 'routine', 'dayplan', 'raci', 'sleep', 'okr', 'birthdays'];
const SCIENCE: ScienceId[] = ['times', 'spelling', 'clock', 'numberline', 'venn', 'history', 'probability', 'trig', 'triangle', 'matrices', 'molar', 'physics'];
const CALC: CalcId[] = ['regression', 'samplesize', 'fuel', 'pay', 'recipe', 'timesheet', 'unitprice'];
const STAGE: StageId[] = ['bingo', 'gameboard', 'nametags', 'queue'];
const ART: ArtId[] = ['poster', 'bizcard', 'mixer', 'typescale', 'blob', 'ascii', 'drums', 'piano', 'gridsplit'];
const WEB: WebId[] = ['sqlgen', 'jsonts', 'metatags', 'chmod', 'flexbox', 'subnet'];
const PANELS: Panel[] = ['convert', 'compress', 'photo', 'audio', 'notes', ...QUICK, 'pdf-merge', 'pdf-split', 'pdf-images', ...MORE, ...IMAGES.map((i) => `img-${i}` as const), ...PLAN, ...STUDY, ...DATA, ...MAKER, ...WORD, ...ORGANISE, ...CLASS, ...MONEY, ...MEDIA, ...DEV, ...PEN, ...LIFE, ...SCIENCE, ...CALC, ...STAGE, ...ART, ...WEB];
/** Tools that need the whole width (boards, timelines, editors with a preview). */
const WIDE = new Set<string>(['mindmap', 'stickies', 'gantt', 'timetable', 'flow', 'cv', 'playground', 'explore', 'zones', 'wordsearch', 'rubric', 'graph', 'habits', 'periodic', 'week', 'matrix', 'swot', 'journal', 'seating', 'dice', 'meeting', 'goals', 'colourblind', 'shadow', 'kanban', 'times', 'venn', 'history', 'regression', 'bingo', 'gameboard', 'poster', 'bizcard', 'drums', 'piano', 'sqlgen', 'jsonts', 'metatags', 'flexbox', 'essay', 'cornell', 'trip', 'dayplan', 'raci', 'queue']);
const setOf = (id: string): keyof typeof LOAD | null =>
  id === 'notes' ? 'notes' : id.startsWith('pdf-') ? 'pdf' : id.startsWith('img-') ? 'image' : (MORE as string[]).includes(id) ? 'more' : (QUICK as string[]).includes(id) ? 'quick'
    : (PLAN as string[]).includes(id) ? 'plan' : (STUDY as string[]).includes(id) ? 'study' : (DATA as string[]).includes(id) ? 'data' : (MAKER as string[]).includes(id) ? 'maker'
    : (WORD as string[]).includes(id) ? 'word' : (ORGANISE as string[]).includes(id) ? 'organise' : (CLASS as string[]).includes(id) ? 'class'
    : (MONEY as string[]).includes(id) ? 'money' : (MEDIA as string[]).includes(id) ? 'media' : (DEV as string[]).includes(id) ? 'dev'
    : (PEN as string[]).includes(id) ? 'pen' : (LIFE as string[]).includes(id) ? 'life' : (SCIENCE as string[]).includes(id) ? 'science' : (CALC as string[]).includes(id) ? 'calc' : (STAGE as string[]).includes(id) ? 'stage' : (ART as string[]).includes(id) ? 'art' : (WEB as string[]).includes(id) ? 'web' : null;
const preload = (id: string) => { const k = setOf(id); if (k) void LOAD[k]().catch(() => {}); };

interface Tool { id: Panel | 'pdf' | 'video'; name: string; what: string; icon: LucideIcon; tint: string; group: string; fresh?: boolean }
const TOOLS: Tool[] = [
  { group: 'Write', fresh: true, id: 'essay', name: 'Essay planner', what: 'Thesis, point–evidence–explain paragraphs, conclusion', icon: PenLine, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Write', fresh: true, id: 'prompts', name: 'Writing prompts', what: 'Story, opinion and poetry starters, with a timer', icon: Lightbulb, tint: 'from-amber-400 to-orange-500' },
  { group: 'Write', fresh: true, id: 'poem', name: 'Poem helper', what: 'Syllables per line, haiku check, rhyming endings', icon: Feather, tint: 'from-violet-500 to-pink-500' },
  { group: 'Write', fresh: true, id: 'acrostic', name: 'Acrostic', what: 'A word down the side, a line for each letter', icon: AlignLeft, tint: 'from-pink-500 to-rose-500' },
  { group: 'Write', fresh: true, id: 'typing', name: 'Typing practice', what: 'Words a minute and accuracy, with your best', icon: TextCursorInput, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Write', fresh: true, id: 'glossary', name: 'Glossary', what: 'Terms and meanings A–Z; send them to Flashcards', icon: BookA, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Write', fresh: true, id: 'cornell', name: 'Cornell notes', what: 'Questions, notes and a summary, the proven way', icon: NotebookTabs, tint: 'from-zinc-500 to-indigo-500' },
  { group: 'Write', fresh: true, id: 'interview', name: 'Interview practice', what: 'Questions read aloud, an answer timer and notes', icon: MessagesSquare, tint: 'from-teal-500 to-sky-500' },
  { group: 'Plan and organise', fresh: true, id: 'kanban', name: 'Kanban board', what: 'Cards in columns; drag them along to Done', icon: SquareKanban, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Plan and organise', fresh: true, id: 'event', name: 'Event planner', what: 'Guests and replies, costs against a budget', icon: PartyPopper, tint: 'from-pink-500 to-amber-500' },
  { group: 'Plan and organise', fresh: true, id: 'trip', name: 'Trip planner', what: 'Day-by-day stops with times and costs', icon: Plane, tint: 'from-sky-500 to-teal-500' },
  { group: 'Plan and organise', fresh: true, id: 'routine', name: 'Routines', what: 'Steps with minutes, run as a guided timer', icon: Repeat, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Plan and organise', fresh: true, id: 'dayplan', name: 'Day planner', what: 'Half-hour blocks for the day, with now marked', icon: Sun, tint: 'from-amber-400 to-pink-500' },
  { group: 'Plan and organise', fresh: true, id: 'raci', name: 'RACI chart', what: 'Who does, owns, is asked and is told', icon: Table, tint: 'from-violet-500 to-zinc-600' },
  { group: 'Plan and organise', fresh: true, id: 'sleep', name: 'Sleep log', what: 'Bedtimes and wake-ups; hours against a goal', icon: Moon, tint: 'from-indigo-600 to-violet-500' },
  { group: 'Plan and organise', fresh: true, id: 'okr', name: 'Goals with key results (OKRs)', what: 'An objective and the numbers that prove it', icon: Goal, tint: 'from-rose-500 to-orange-500' },
  { group: 'Plan and organise', fresh: true, id: 'birthdays', name: 'Birthdays', what: 'Who’s next, and how old they’ll be', icon: Gift, tint: 'from-pink-500 to-fuchsia-500' },
  { group: 'Study and teach', fresh: true, id: 'times', name: 'Times tables', what: 'The square to explore and a quiz on one table', icon: Asterisk, tint: 'from-amber-500 to-rose-500' },
  { group: 'Study and teach', fresh: true, id: 'spelling', name: 'Spelling test', what: 'Words read aloud; type them; practise the misses', icon: SpellCheck, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Study and teach', fresh: true, id: 'clock', name: 'Telling the time', what: 'A clock to read, set and be quizzed on', icon: AlarmClock, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Study and teach', fresh: true, id: 'numberline', name: 'Number line', what: 'Fractions, decimals and negatives in order', icon: MoveHorizontal, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Study and teach', fresh: true, id: 'venn', name: 'Venn diagram', what: 'Two or three groups and what they share', icon: Blend, tint: 'from-pink-500 to-violet-500' },
  { group: 'Study and teach', fresh: true, id: 'history', name: 'History timeline', what: 'Events by year, spaced by time; print it', icon: Milestone, tint: 'from-amber-600 to-orange-500' },
  { group: 'Study and teach', fresh: true, id: 'probability', name: 'Probability', what: 'Thousands of coin flips and dice rolls vs theory', icon: ChartBarBig, tint: 'from-violet-500 to-sky-500' },
  { group: 'Study and teach', fresh: true, id: 'trig', name: 'Trigonometry', what: 'Turn the angle; watch sin, cos and tan', icon: Radius, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Study and teach', fresh: true, id: 'triangle', name: 'Triangle solver', what: 'Any three sides and angles give the rest', icon: Triangle, tint: 'from-rose-500 to-amber-500' },
  { group: 'Study and teach', fresh: true, id: 'matrices', name: 'Matrices', what: 'Add, multiply, determinant, inverse', icon: Brackets, tint: 'from-zinc-600 to-sky-600' },
  { group: 'Study and teach', fresh: true, id: 'molar', name: 'Molar mass', what: 'Any chemical formula, in g/mol, element by element', icon: FlaskConical, tint: 'from-emerald-600 to-teal-500' },
  { group: 'Study and teach', fresh: true, id: 'physics', name: 'Physics formulas', what: 'Speed, force, Ohm’s law and more, solved', icon: Magnet, tint: 'from-rose-600 to-indigo-500' },
  { group: 'Sheets and data', fresh: true, id: 'regression', name: 'Line of best fit', what: 'Scatter chart, trend line, r² and predictions', icon: TrendingUp, tint: 'from-indigo-500 to-emerald-500' },
  { group: 'Sheets and data', fresh: true, id: 'samplesize', name: 'Survey size', what: 'How many people to ask to trust the answer', icon: UsersRound, tint: 'from-sky-500 to-violet-500' },
  { group: 'Sheets and data', fresh: true, id: 'fuel', name: 'Fuel cost', what: 'Distance, mileage and price; per person', icon: Fuel, tint: 'from-amber-500 to-rose-500' },
  { group: 'Sheets and data', fresh: true, id: 'pay', name: 'Pay calculator', what: 'Hourly into weekly, monthly and yearly', icon: Banknote, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', fresh: true, id: 'recipe', name: 'Recipe scaler', what: 'Change the servings; every amount follows', icon: CookingPot, tint: 'from-orange-500 to-amber-500' },
  { group: 'Sheets and data', fresh: true, id: 'timesheet', name: 'Timesheet', what: 'Shifts and breaks into hours and pay', icon: BriefcaseBusiness, tint: 'from-zinc-500 to-sky-500' },
  { group: 'Sheets and data', fresh: true, id: 'unitprice', name: 'Best value', what: 'Which pack is cheapest per gram or piece', icon: BadgePercent, tint: 'from-lime-500 to-emerald-600' },
  { group: 'Present', fresh: true, id: 'bingo', name: 'Bingo', what: 'Print cards and call numbers, big', icon: Ticket, tint: 'from-pink-500 to-violet-500' },
  { group: 'Present', fresh: true, id: 'gameboard', name: 'Quiz game board', what: 'Categories and points for team quizzes', icon: Gamepad2, tint: 'from-indigo-600 to-amber-500' },
  { group: 'Present', fresh: true, id: 'nametags', name: 'Name tags', what: 'A list of names into tags to print', icon: Contact, tint: 'from-sky-500 to-pink-500' },
  { group: 'Present', fresh: true, id: 'queue', name: 'Speaking queue', what: 'Hands up in order, a timer for each speaker', icon: Hand, tint: 'from-teal-500 to-violet-500' },
  { group: 'Design and media', fresh: true, id: 'poster', name: 'Event poster', what: 'Title, date and place on a theme, A4', icon: Megaphone, tint: 'from-fuchsia-500 to-orange-500' },
  { group: 'Design and media', fresh: true, id: 'bizcard', name: 'Business cards', what: 'A card as a picture, or ten to print', icon: CreditCard, tint: 'from-indigo-600 to-sky-500' },
  { group: 'Design and media', fresh: true, id: 'mixer', name: 'Colour mixer', what: 'Blend two colours; tints and shades', icon: Paintbrush, tint: 'from-violet-500 to-pink-500' },
  { group: 'Design and media', fresh: true, id: 'typescale', name: 'Type scale', what: 'Text sizes that go together, as CSS', icon: ALargeSmall, tint: 'from-zinc-600 to-pink-500' },
  { group: 'Design and media', fresh: true, id: 'blob', name: 'Blob shapes', what: 'Soft shapes for backgrounds, as SVG', icon: Droplets, tint: 'from-pink-500 to-indigo-500' },
  { group: 'Design and media', fresh: true, id: 'ascii', name: 'ASCII art', what: 'A picture as letters and symbols', icon: Terminal, tint: 'from-zinc-700 to-emerald-600' },
  { group: 'Design and media', fresh: true, id: 'drums', name: 'Drum machine', what: '16 steps of kick, snare, hi-hat and clap', icon: Music4, tint: 'from-rose-500 to-violet-600' },
  { group: 'Design and media', fresh: true, id: 'piano', name: 'Piano', what: 'Two octaves to play and record a tune', icon: Piano, tint: 'from-zinc-800 to-zinc-500' },
  { group: 'Design and media', fresh: true, id: 'gridsplit', name: 'Photo grid', what: 'Split a photo into tiles for a carousel', icon: Columns3, tint: 'from-amber-500 to-pink-500' },
  { group: 'Code', fresh: true, id: 'sqlgen', name: 'CSV to SQL', what: 'A table into CREATE TABLE and INSERTs', icon: Database, tint: 'from-sky-600 to-indigo-600' },
  { group: 'Code', fresh: true, id: 'jsonts', name: 'JSON to TypeScript', what: 'Types for any JSON sample', icon: FileJson, tint: 'from-indigo-600 to-sky-500' },
  { group: 'Code', fresh: true, id: 'metatags', name: 'Link preview tags', what: 'Title, text and picture for shared links', icon: Share2, tint: 'from-pink-500 to-indigo-600' },
  { group: 'Code', fresh: true, id: 'chmod', name: 'File permissions', what: '755 ↔ rwxr-xr-x with tick boxes', icon: Lock, tint: 'from-zinc-600 to-amber-600' },
  { group: 'Code', fresh: true, id: 'flexbox', name: 'Flexbox playground', what: 'Line boxes up visually; copy the CSS', icon: AlignHorizontalSpaceAround, tint: 'from-teal-500 to-pink-500' },
  { group: 'Code', fresh: true, id: 'subnet', name: 'Subnet calculator', what: 'An IP address and /bits into its range', icon: Router, tint: 'from-emerald-600 to-zinc-700' },
  { group: 'Write', id: 'journal', name: 'Journal', what: 'A private page a day, with a mood and search', icon: BookHeart, tint: 'from-pink-500 to-violet-500' },
  { group: 'Write', id: 'letters', name: 'Letter writer', what: 'Leave requests, thank-yous, complaints: fill the blanks', icon: Mail, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Write', id: 'fancy', name: 'Fancy letters', what: '𝐁𝐨𝐥𝐝, 𝘪𝘵𝘢𝘭𝘪𝘤, Ⓒⓘⓡⓒⓛⓔⓓ and more for bios and posts', icon: Type, tint: 'from-fuchsia-500 to-pink-500' },
  { group: 'Write', id: 'lines', name: 'Line tools', what: 'Number, prefix, wrap, join, split and filter lines', icon: ListOrdered, tint: 'from-zinc-500 to-sky-500' },
  { group: 'Write', id: 'numwords', name: 'Numbers in words', what: '1,250 → one thousand two hundred and fifty, for cheques', icon: WholeWord, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Write', id: 'roman', name: 'Roman numerals', what: '2026 ↔ MMXXVI, both ways', icon: Landmark, tint: 'from-amber-500 to-orange-500' },
  { group: 'Write', id: 'morse', name: 'Morse code', what: 'Text ↔ dots and dashes, played as beeps', icon: Radio, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Write', id: 'lorem', name: 'Placeholder text', what: 'Lorem ipsum paragraphs for layouts', icon: Pilcrow, tint: 'from-zinc-400 to-zinc-600' },
  { group: 'Write', id: 'wordplay', name: 'Word play', what: 'Anagrams, palindromes and letter counts', icon: Puzzle, tint: 'from-violet-500 to-pink-500' },
  { group: 'Plan and organise', id: 'matrix', name: 'Priority matrix', what: 'Urgent or important? Sort tasks into four boxes', icon: Grid2x2, tint: 'from-rose-500 to-indigo-500' },
  { group: 'Plan and organise', id: 'week', name: 'Week planner', what: 'A column a day; drag tasks between days', icon: CalendarFold, tint: 'from-sky-500 to-teal-500' },
  { group: 'Plan and organise', id: 'goals', name: 'Goals', what: 'Goals broken into steps, with progress rings', icon: Target, tint: 'from-pink-500 to-orange-500' },
  { group: 'Plan and organise', id: 'checklists', name: 'Checklists', what: 'Exam day, packing, events: tick them off', icon: ListChecks, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Plan and organise', id: 'countdowns', name: 'Countdowns', what: 'Days, hours and minutes to what matters', icon: Hourglass, tint: 'from-violet-500 to-sky-500' },
  { group: 'Plan and organise', id: 'meeting', name: 'Meeting notes', what: 'Who came, what was decided, who does what', icon: Users, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Plan and organise', id: 'swot', name: 'SWOT analysis', what: 'Strengths, weaknesses, opportunities, threats', icon: LayoutDashboard, tint: 'from-teal-500 to-amber-500' },
  { group: 'Plan and organise', id: 'proscons', name: 'Pros and cons', what: 'For and against, weighed, with a leaning', icon: ThumbsUp, tint: 'from-emerald-500 to-rose-500' },
  { group: 'Plan and organise', id: 'reading', name: 'Reading list', what: 'Books to read, reading and read, with pages', icon: BookMarked, tint: 'from-amber-500 to-pink-500' },
  { group: 'Study and teach', id: 'periodic', name: 'Periodic table', what: 'All 118 elements: tap for facts, find families', icon: Atom, tint: 'from-sky-500 to-emerald-500' },
  { group: 'Study and teach', id: 'quiz', name: 'Quiz maker', what: 'Write a quiz, take it here, or print it', icon: CircleHelp, tint: 'from-violet-500 to-pink-500' },
  { group: 'Study and teach', id: 'drill', name: 'Maths drill', what: 'As many sums as you can in a minute', icon: Zap, tint: 'from-amber-500 to-rose-500' },
  { group: 'Study and teach', id: 'equation', name: 'Equation solver', what: 'ax² + bx + c = 0, with the working shown', icon: Variable, tint: 'from-indigo-500 to-sky-500' },
  { group: 'Study and teach', id: 'fractions', name: 'Fractions', what: 'Add, take away, times, divide; simplest form', icon: Divide, tint: 'from-teal-500 to-sky-500' },
  { group: 'Study and teach', id: 'shapes', name: 'Shapes calculator', what: 'Area, perimeter, volume, with the formula', icon: Shapes, tint: 'from-pink-500 to-amber-500' },
  { group: 'Study and teach', id: 'numfacts', name: 'Number facts', what: 'Prime or not, factors, HCF and LCM', icon: Binary, tint: 'from-zinc-600 to-indigo-500' },
  { group: 'Study and teach', id: 'seating', name: 'Seating plan', what: 'Names into seats; tap two to swap; print', icon: Armchair, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Study and teach', id: 'dice', name: 'Dice and coins', what: 'Roll dice, flip a coin, pick a number, fairly', icon: Dice5, tint: 'from-rose-500 to-violet-500' },
  { group: 'Study and teach', id: 'traffic', name: 'Traffic light', what: 'Red, amber, green for the kind of work, big', icon: TrafficCone, tint: 'from-rose-500 to-emerald-500' },
  { group: 'Study and teach', id: 'scoreboard', name: 'Scoreboard', what: 'Team scores, big, with the leader on top', icon: Trophy, tint: 'from-amber-400 to-orange-500' },
  { group: 'Sheets and data', id: 'loan', name: 'Loan and EMI', what: 'Monthly payment, interest and the schedule', icon: HandCoins, tint: 'from-indigo-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'savings', name: 'Savings growth', what: 'A deposit each month, with interest, over years', icon: PiggyBank, tint: 'from-pink-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'split', name: 'Split the bill', what: 'Who paid what, and who pays whom', icon: Split, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Sheets and data', id: 'price', name: 'Price calculator', what: 'Discount and tax (GST, VAT), in or on top', icon: Tag, tint: 'from-amber-500 to-lime-500' },
  { group: 'Sheets and data', id: 'age', name: 'Age calculator', what: 'Exact age and days to the next birthday', icon: Cake, tint: 'from-pink-500 to-rose-500' },
  { group: 'Sheets and data', id: 'bmi', name: 'BMI', what: 'Weight for height, a rough guide for adults', icon: HeartPulse, tint: 'from-rose-500 to-pink-500' },
  { group: 'Present', id: 'stopwatch', name: 'Stopwatch', what: 'Laps, best and worst, smooth big digits', icon: Watch, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Present', id: 'poll', name: 'Room poll', what: 'Count hands, watch the bars, show it full screen', icon: Vote, tint: 'from-violet-500 to-pink-500' },
  { group: 'Present', id: 'agenda', name: 'Agenda timer', what: 'Each part of a talk gets its minutes', icon: ListTodo, tint: 'from-teal-500 to-indigo-500' },
  { group: 'Design and media', id: 'booth', name: 'Photo booth', what: 'The camera with filters and a 3-2-1 countdown', icon: Aperture, tint: 'from-pink-500 to-violet-500' },
  { group: 'Design and media', id: 'pixel', name: 'Pixel art', what: 'Draw on a grid; fill, mirror, save sharp', icon: Brush, tint: 'from-amber-500 to-pink-500' },
  { group: 'Design and media', id: 'meme', name: 'Meme maker', what: 'Words at the top and bottom of a picture', icon: Laugh, tint: 'from-orange-500 to-rose-500' },
  { group: 'Design and media', id: 'icon', name: 'App icon maker', what: 'A letter or emoji on a colour, every size', icon: Smartphone, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Design and media', id: 'cleanphoto', name: 'Clean a photo', what: 'Remove hidden camera and location details', icon: ShieldCheck, tint: 'from-emerald-600 to-zinc-800' },
  { group: 'Design and media', id: 'colourblind', name: 'Colour-blind view', what: 'See a picture as colour-blind people do', icon: Eye, tint: 'from-sky-500 to-rose-500' },
  { group: 'Design and media', id: 'metronome', name: 'Metronome', what: 'Steady beats; tap the speed', icon: Drum, tint: 'from-zinc-600 to-pink-500' },
  { group: 'Design and media', id: 'tuner', name: 'Tuner', what: 'Sing or play a note: how close is it?', icon: Guitar, tint: 'from-amber-600 to-rose-500' },
  { group: 'Design and media', id: 'focus', name: 'Focus sounds', what: 'White, pink or brown noise, with a timer', icon: Headphones, tint: 'from-indigo-600 to-teal-500' },
  { group: 'Code', id: 'base', name: 'Number bases', what: 'Binary, octal, decimal, hex; text as bytes', icon: SquareFunction, tint: 'from-sky-600 to-indigo-600' },
  { group: 'Code', id: 'names', name: 'Name styles', what: 'camelCase, snake_case, kebab-case and more', icon: CaseUpper, tint: 'from-teal-500 to-sky-600' },
  { group: 'Code', id: 'shadow', name: 'Shadow maker', what: 'CSS shadows and corners, seen live', icon: SquareDashed, tint: 'from-zinc-500 to-violet-600' },
  { group: 'Code', id: 'cron', name: 'Cron reader', what: 'What a schedule means, and its next runs', icon: TimerReset, tint: 'from-violet-600 to-sky-600' },
  { group: 'Code', id: 'escape', name: 'HTML escape', what: '< and & turned into safe text for web pages, and back', icon: Code, tint: 'from-orange-600 to-zinc-700' },
  { group: 'Code', id: 'chars', name: 'Hidden characters', what: 'Find zero-width spaces and other invisibles', icon: ScanText, tint: 'from-amber-600 to-zinc-800' },
  { group: 'Code', id: 'status', name: 'Status codes', what: '404, 503 and the rest in plain words', icon: Server, tint: 'from-rose-600 to-indigo-600' },
  { group: 'Code', id: 'keys', name: 'Key tester', what: 'What the browser hears for each key', icon: Keyboard, tint: 'from-zinc-600 to-sky-600' },
  { group: 'Code', id: 'mock', name: 'Sample data', what: 'Made-up people as CSV or JSON for testing', icon: DatabaseZap, tint: 'from-emerald-600 to-indigo-600' },
  { group: 'Plan and organise', id: 'mindmap', name: 'Mind map', what: 'Ideas branching out; keyboard-fast, save as a picture', icon: Network, tint: 'from-violet-500 to-pink-500' },
  { group: 'Plan and organise', id: 'outline', name: 'Outliner', what: 'Nested bullet points that fold, move and tick off', icon: ListTree, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Plan and organise', id: 'stickies', name: 'Sticky-note wall', what: 'Brainstorm: drag notes around, colour and vote', icon: StickyNote, tint: 'from-amber-400 to-pink-500' },
  { group: 'Plan and organise', id: 'gantt', name: 'Timeline (Gantt)', what: 'Tasks as bars over the days, with today marked', icon: ChartGantt, tint: 'from-sky-500 to-indigo-500' },
  { group: 'Plan and organise', id: 'flow', name: 'Flowchart', what: 'Write “A -> B” and the chart draws itself', icon: Workflow, tint: 'from-teal-500 to-sky-500' },
  { group: 'Plan and organise', id: 'timetable', name: 'Timetable maker', what: 'A weekly timetable, coloured by subject, to print', icon: CalendarDays, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Plan and organise', id: 'habits', name: 'Habit tracker', what: 'Tick each day and keep your streak going', icon: CalendarCheck, tint: 'from-pink-500 to-rose-500' },
  { group: 'Plan and organise', id: 'decide', name: 'Decision helper', what: 'Score your choices on what matters most', icon: Scale, tint: 'from-amber-500 to-orange-500' },
  { group: 'Plan and organise', id: 'zones', name: 'World clock', what: 'Times around the world and hours that suit everyone', icon: Earth, tint: 'from-sky-500 to-teal-500' },
  { group: 'Study and teach', id: 'cards', name: 'Flashcards', what: 'Decks that bring back what you keep forgetting', icon: Layers, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Study and teach', id: 'studyplan', name: 'Revision planner', what: 'Exam dates into a day-by-day plan, for your calendar', icon: CalendarClock, tint: 'from-violet-500 to-sky-500' },
  { group: 'Study and teach', id: 'gpa', name: 'Grades and GPA', what: 'Your average, GPA, and what you need on the rest', icon: GraduationCap, tint: 'from-emerald-500 to-sky-500' },
  { group: 'Study and teach', id: 'rubric', name: 'Rubric maker', what: 'Criteria and levels; click to mark a piece of work', icon: ClipboardList, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Study and teach', id: 'wordsearch', name: 'Word search', what: 'Make one to print, or play it here', icon: Grid3x3, tint: 'from-amber-500 to-rose-500' },
  { group: 'Study and teach', id: 'certificate', name: 'Certificate maker', what: 'Awards with a name, reason and signature line', icon: Award, tint: 'from-amber-500 to-yellow-500' },
  { group: 'Study and teach', id: 'wheel', name: 'Spin the wheel', what: 'Pick a name with a spin the whole class can watch', icon: Disc3, tint: 'from-pink-500 to-violet-500' },
  { group: 'Study and teach', id: 'noise', name: 'Noise meter', what: 'How loud is the room? A dial with a limit you set', icon: AudioLines, tint: 'from-rose-500 to-orange-500' },

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
  { group: 'Write', id: 'cv', name: 'CV builder', what: 'Fill it in, see the page, save it as a PDF', icon: IdCard, tint: 'from-indigo-500 to-sky-500' },
  { group: 'Write', id: 'markdown', name: 'Markdown preview', what: 'Write Markdown, see the page, copy the HTML', icon: FileText, tint: 'from-zinc-500 to-zinc-700' },
  { group: 'PDF and files', id: 'pdf', name: 'Edit a PDF', what: 'Sign, fill in, reorder or remove pages', icon: FileText, tint: 'from-rose-500 to-amber-500' },
  { group: 'PDF and files', id: 'pdf-merge', name: 'Join PDFs', what: 'Put several PDFs together, in your order', icon: Combine, tint: 'from-rose-500 to-pink-500' },
  { group: 'PDF and files', id: 'pdf-split', name: 'Take pages out', what: 'Keep only the pages you pick from a PDF', icon: Scissors, tint: 'from-amber-500 to-rose-500' },
  { group: 'PDF and files', id: 'pdf-images', name: 'Pictures to PDF', what: 'Photos or scans into one PDF, a page each', icon: FileImage, tint: 'from-orange-500 to-amber-500' },
  { group: 'PDF and files', id: 'convert', name: 'Convert files', what: 'Word to PDF, PDF to pictures, Excel to CSV and more', icon: Repeat2, tint: 'from-indigo-500 to-sky-500' },
  { group: 'PDF and files', id: 'compress', name: 'Compress files', what: 'Make PDFs, photos, videos and documents smaller', icon: Minimize2, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Sheets and data', id: 'table', name: 'Table tools', what: 'Totals per column; CSV, JSON or Markdown', icon: Table2, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', id: 'explore', name: 'Data explorer', what: 'Open a CSV: sort, filter and total by group', icon: TableProperties, tint: 'from-emerald-500 to-teal-500' },
  { group: 'Sheets and data', id: 'graph', name: 'Graph plotter', what: 'Draw y = 2x + 1, sin(x)… drag and zoom', icon: ChartSpline, tint: 'from-violet-500 to-indigo-500' },
  { group: 'Sheets and data', id: 'stats', name: 'Statistics', what: 'Mean, median, mode, spread and a histogram', icon: Sigma, tint: 'from-sky-500 to-violet-500' },
  { group: 'Sheets and data', id: 'budget', name: 'Budget planner', what: 'Money in and out, and where it goes', icon: Wallet, tint: 'from-emerald-500 to-lime-500' },
  { group: 'Sheets and data', id: 'invoice', name: 'Invoice maker', what: 'Items, tax and discount; print or save as PDF', icon: Receipt, tint: 'from-zinc-500 to-indigo-500' },
  { group: 'Sheets and data', id: 'calc', name: 'Calculator', what: 'Sums with brackets, powers and %, kept in a list', icon: Calculator, tint: 'from-indigo-500 to-violet-500' },
  { group: 'Sheets and data', id: 'chart', name: 'Chart maker', what: 'Numbers into a bar or line chart picture', icon: ChartColumn, tint: 'from-violet-500 to-pink-500' },
  { group: 'Sheets and data', id: 'units', name: 'Unit converter', what: 'Length, weight, area, volume, speed, data, time, temperature', icon: Ruler, tint: 'from-teal-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'percent', name: 'Percentages', what: 'A% of B, what % is it, change between', icon: Percent, tint: 'from-lime-500 to-emerald-500' },
  { group: 'Sheets and data', id: 'dates', name: 'Date calculator', what: 'Days and weekdays between dates, or days on', icon: CalendarRange, tint: 'from-sky-500 to-teal-500' },
  { group: 'Sheets and data', id: 'picker', name: 'Random picker and groups', what: 'Pick someone, or split a class into groups', icon: Shuffle, tint: 'from-pink-500 to-amber-500' },
  { group: 'Present', id: 'present', name: 'Quick presenter', what: 'Write slides as text, present full screen', icon: Presentation, tint: 'from-indigo-500 to-pink-500' },
  { group: 'Present', id: 'prompter', name: 'Teleprompter', what: 'Your script scrolls by itself, big and steady', icon: ScrollText, tint: 'from-zinc-700 to-pink-500' },
  { group: 'Present', id: 'timer', name: 'Countdown', what: 'A big timer for talks, tests and breaks', icon: Timer, tint: 'from-rose-500 to-orange-500' },
  { group: 'Present', id: 'img-quote', name: 'Quote cards', what: 'Words on a colour, for posts and slides', icon: MessageSquareQuote, tint: 'from-fuchsia-500 to-pink-500' },
  { group: 'Design and media', id: 'slideshow', name: 'Slideshow video', what: 'Pictures into a video with soft fades', icon: Film, tint: 'from-violet-500 to-pink-500' },
  { group: 'Design and media', id: 'redact', name: 'Hide parts of a picture', what: 'Blur, pixelate or black out names and faces', icon: EyeOff, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Design and media', id: 'signature', name: 'Signature pad', what: 'Sign with a finger or pen; a see-through PNG', icon: Signature, tint: 'from-indigo-600 to-sky-500' },
  { group: 'Design and media', id: 'cloud', name: 'Word cloud', what: 'The words used most, bigger the more they appear', icon: Cloud, tint: 'from-sky-400 to-pink-500' },
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
  { group: 'Design and media', id: 'barcode', name: 'Barcodes', what: 'Code 128 bars for labels, stock and tickets', icon: Barcode, tint: 'from-zinc-700 to-zinc-900' },
  { group: 'Design and media', id: 'qr', name: 'QR codes', what: 'A code for any link, ready to print', icon: QrCode, tint: 'from-zinc-600 to-zinc-900' },
  { group: 'Design and media', id: 'video', name: 'Edit a video', what: 'Trim, join clips, add text and music', icon: Clapperboard, tint: 'from-violet-500 to-sky-500' },
  { group: 'Design and media', id: 'record', name: 'Record the screen', what: 'A lesson, a demo or a bug, as a video', icon: MonitorPlay, tint: 'from-rose-500 to-violet-500' },
  { group: 'Design and media', id: 'audio', name: 'Edit sound', what: 'Record, trim and clean up audio', icon: AudioWaveform, tint: 'from-indigo-400 to-indigo-600' },
  { group: 'Code', id: 'playground', name: 'Code playground', what: 'HTML, CSS and JavaScript with a live page', icon: CodeXml, tint: 'from-pink-500 to-indigo-600' },
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
  // M75: a shared link (/studio?shared=<token>) opens its tool with the shared work, in its own scope.
  const sharedToken = params.get('shared');
  const [sharedRes, setSharedRes] = useState<{ token: string; s?: Shared; err?: string } | null>(null);
  useEffect(() => {
    if (!sharedToken) return;
    let alive = true;
    if (!isToken(sharedToken)) { Promise.resolve().then(() => alive && setSharedRes({ token: sharedToken, err: 'This link isn’t complete. Ask for it again.' })); return () => { alive = false; }; }
    loadShared(sharedToken).then((s) => alive && setSharedRes({ token: sharedToken, s }), (e) => alive && setSharedRes({ token: sharedToken, err: (e as Error).message }));
    return () => { alive = false; };
  }, [sharedToken]);
  const shared = sharedToken && sharedRes?.token === sharedToken ? sharedRes : null;
  const sharedTool = shared?.s && PANELS.includes(shared.s.tool as Panel) ? (shared.s.tool as Panel) : null;
  const panel = sharedToken ? sharedTool : PANELS.includes(asked as Panel) ? (asked as Panel) : null;
  // The save that's open (Save then saves over it), and a counter that reopens the tool after loading one.
  const [current, setCurrent] = useState<Current | null>(null);
  const [gen, setGen] = useState(0);
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
  const openSave = async (id: string) => {
    const c = await loadSave(id);
    if (!c) return;
    if (!PANELS.includes(c.tool as Panel)) { toast.error('That tool isn’t here any more.'); return; }
    setCurrent(c); setGen((g) => g + 1); open(c.tool as Panel);
    toast.success(`“${c.title}” opened`);
  };
  const keepCopy = () => {
    if (!sharedToken || !panel) return;
    keepShared(sharedToken); setCurrent(null); setGen((g) => g + 1);
    router.push(`/studio?tool=${panel}`, { scroll: false });
    toast.success('It’s yours now, on this device. Save it to your account to have it everywhere.');
  };
  const star = (id: string) => setStars(stars.includes(id) ? stars.filter((s) => s !== id) : [id, ...stars]);
  // M74, for every tool: focus mode (the tool fills the window), the previous and next tool in its
  // group, a link to copy, more tools like it, and a text file dropped on it fills its text box.
  const [focusOn, setFocusOn] = useState<string | null>(null);
  const focus = !!panel && focusOn === panel;
  const [linked, setLinked] = useState(false);
  const [dropping, setDropping] = useState(false);
  const info = panel ? BY_ID.get(panel) : undefined;
  const siblings = info ? TOOLS.filter((t) => t.group === info.group && PANELS.includes(t.id as Panel)) : [];
  const at = siblings.findIndex((t) => t.id === panel);
  const prev = at >= 0 && siblings.length > 1 ? siblings[(at - 1 + siblings.length) % siblings.length] : null;
  const next = at >= 0 && siblings.length > 1 ? siblings[(at + 1) % siblings.length] : null;
  const more = at >= 0 ? [1, 2, 3].map((k) => siblings[(at + k) % siblings.length]).filter((t, k, a) => t && t.id !== panel && a.indexOf(t) === k) : [];
  // Esc leaves focus mode, then goes back to the list; [ and ] go to the previous and next tool
  // (not while typing, and not when a full-screen view is open).
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.defaultPrevented || document.fullscreenElement || document.querySelector('[aria-modal="true"]') || el?.closest('input, textarea, select, [contenteditable="true"], [role="application"], [role="textbox"]')) return;
      if (e.key === 'Escape') { if (focus) setFocusOn(null); else router.push('/studio', { scroll: false }); }
      else if (e.key === '[' && prev) router.push(`/studio?tool=${prev.id}`, { scroll: false });
      else if (e.key === ']' && next) router.push(`/studio?tool=${next.id}`, { scroll: false });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [panel, router, focus, prev, next]);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/studio?tool=${panel}`); setLinked(true); setTimeout(() => setLinked(false), 1400); }
    catch { toast.error('Copy didn’t work here.'); }
  };
  // A text file dropped on a tool fills its first text box (React hears it as typing).
  const TEXTY = /\.(txt|md|markdown|csv|tsv|json|html?|css|js|ts|tsx|jsx|xml|ya?ml|log|ini|srt|vtt)$/i;
  const drop = async (e: React.DragEvent<HTMLElement>) => {
    setDropping(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    e.preventDefault();
    const box = e.currentTarget.querySelector<HTMLTextAreaElement>('textarea:not([readonly])');
    if (!box || !(f.type.startsWith('text/') || f.type === 'application/json' || TEXTY.test(f.name))) { toast.error(box ? 'Drop a text file here (.txt, .md, .csv, .json…). Open pictures and PDFs with the tool’s own button.' : 'This tool has no text box to fill.'); return; }
    if (f.size > 2_000_000) { toast.error('That file is over 2 MB: too big to paste in.'); return; }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(box, await f.text());
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.focus();
    toast.success(`“${f.name}” loaded`);
  };

  const editor = video ? <VideoEditor key={video.map((f) => f.name + f.size).join('|')} files={video} onClose={() => setVideo(null)} />
    : audio ? <AudioEditor key={audio === 'record' ? 'record' : audio.name + audio.size} file={audio === 'record' ? null : audio} onClose={() => setAudio(null)} />
    : pdf ? <PdfEditor key={pdf.name + pdf.size} file={pdf} onClose={() => setPdf(null)} />
    : doc ? <PhotoEditor key={`${doc.name}-${doc.w}-${doc.h}`} initial={doc} onClose={() => setDoc(null)} />
    : null;
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
              <motion.div key={panel} initial={enter} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.smooth }} exit={leave}
                className={cn('mx-auto space-y-4', focus ? 'fixed inset-0 z-[70] max-w-none overflow-y-auto bg-[#f0f0f0] dark:bg-[#0a0f2b] p-4 md:p-8' : WIDE.has(panel) ? 'max-w-6xl' : 'max-w-4xl')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {focus ? <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Focus mode · Esc to leave</span>
                    : <button type="button" onClick={() => open(null)} className="group inline-flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white min-h-11"><ArrowLeft className="w-4 h-4 rtl:rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" aria-hidden />Everything in Create</button>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {prev && next && !focus && !sharedToken && (
                      <nav aria-label="Other tools in this group" className="flex items-center gap-1">
                        <button type="button" onClick={() => open(prev.id as Panel)} onPointerEnter={() => preload(prev.id)} title={`Previous: ${prev.name} ([)`} className="btn-ghost btn-icon"><ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden /><span className="sr-only">Previous tool: {prev.name}</span></button>
                        <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{at + 1}/{siblings.length}</span>
                        <button type="button" onClick={() => open(next.id as Panel)} onPointerEnter={() => preload(next.id)} title={`Next: ${next.name} (])`} className="btn-ghost btn-icon"><ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden /><span className="sr-only">Next tool: {next.name}</span></button>
                      </nav>
                    )}
                    {set && <button type="button" onClick={() => setFocusOn(focus ? null : panel)} aria-pressed={focus} className="btn-secondary btn-sm">{focus ? <Minimize2 className="w-3.5 h-3.5" aria-hidden /> : <Expand className="w-3.5 h-3.5" aria-hidden />}{focus ? 'Leave focus' : 'Focus'}</button>}
                    {!focus && !sharedToken && <button type="button" onClick={() => void copyLink()} className="btn-secondary btn-sm">{linked ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden /> : <Link2 className="w-3.5 h-3.5" aria-hidden />}<span aria-live="polite">{linked ? 'Link copied' : 'Copy link'}</span></button>}
                    {set && !sharedToken && info && <SaveButtons tool={panel} toolName={info.name} current={current} onSaved={setCurrent} />}
                    {info && !sharedToken && <StarButton on={stars.includes(panel)} name={info.name} onClick={() => star(panel)} solid />}
                  </div>
                </div>
                {panel === 'convert' && <Converter onClose={() => open(null)} />}
                {panel === 'compress' && <Compressor onClose={() => open(null)} />}
                {panel === 'photo' && <PhotoStart onOpen={setDoc} />}
                {panel === 'audio' && <AudioStart onOpen={setAudio} />}
                {shared?.s && (
                  <div role="status" className="flex flex-wrap items-center gap-2 rounded-2xl bg-pink-500/10 ring-1 ring-pink-500/30 px-4 py-3 text-sm text-zinc-900 dark:text-white">
                    <span className="flex-1 min-w-[200px]"><b translate="no">“{shared.s.title}”</b>, shared by <span translate="no">{shared.s.by}</span>. This is your own copy: changes stay on this device.</span>
                    <button type="button" onClick={keepCopy} className="btn-primary btn-sm">Keep it as mine</button>
                  </div>
                )}
                {set && (
                  <section className="panel relative p-5 space-y-4" aria-labelledby="tool-title"
                    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }} onDrop={(e) => void drop(e)}>
                    {dropping && <div className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-pink-500 bg-pink-500/10 text-sm font-semibold text-zinc-900 dark:text-white">Drop a text file to load it</div>}
                    <div className="flex items-center gap-3">
                      {info && <span className={`w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br ${info.tint} text-white grid place-items-center`}><info.icon className="w-5 h-5" aria-hidden /></span>}
                      <div className="min-w-0"><h2 id="tool-title" className="font-bold text-zinc-900 dark:text-white">{info?.name}</h2>{info && <p className="text-xs text-zinc-600 dark:text-zinc-300">{info.what}</p>}</div>
                    </div>
                    <KeptScope value={sharedToken ? `shared:${sharedToken}:` : ''}><div key={`${gen}-${sharedToken ?? ''}`} className="space-y-4">
                    {set === 'notes' ? <QuickNotes />
                      : set === 'pdf' ? <PdfTool id={panel.slice(4) as PdfId} />
                      : set === 'image' ? <ImageTool id={panel.slice(4) as ImageId} />
                      : set === 'more' ? <MoreTool id={panel as MoreId} />
                      : set === 'plan' ? <PlanTool id={panel as PlanId} />
                      : set === 'study' ? <StudyTool id={panel as StudyId} />
                      : set === 'data' ? <DataTool id={panel as DataId} />
                      : set === 'maker' ? <MakerTool id={panel as MakerId} />
                      : set === 'word' ? <WordTool id={panel as WordId} />
                      : set === 'organise' ? <OrganiseTool id={panel as OrganiseId} />
                      : set === 'class' ? <ClassTool id={panel as ClassId} />
                      : set === 'money' ? <MoneyTool id={panel as MoneyId} />
                      : set === 'media' ? <MediaTool id={panel as MediaId} />
                      : set === 'dev' ? <DevTool id={panel as DevId} />
                      : set === 'pen' ? <WritingTool id={panel as PenId} />
                      : set === 'life' ? <LifeTool id={panel as LifeId} />
                      : set === 'science' ? <ScienceTool id={panel as ScienceId} />
                      : set === 'calc' ? <CalcTool id={panel as CalcId} />
                      : set === 'stage' ? <StageTool id={panel as StageId} />
                      : set === 'art' ? <ArtTool id={panel as ArtId} />
                      : set === 'web' ? <WebTool id={panel as WebId} />
                      : <QuickTool id={panel as QuickId} />}
                    </div></KeptScope>
                  </section>
                )}
                {!focus && !sharedToken && more.length > 0 && (
                  <section aria-labelledby="more-h" className="pt-2">
                    <h2 id="more-h" className="mb-2 text-sm font-bold text-zinc-900 dark:text-white">More in {info?.group}</h2>
                    <ul className="grid grid-cols-2 lg:grid-cols-3 gap-3">{more.map((t) => <li key={t.id}><ToolCard t={t} starred={stars.includes(t.id)} onPick={pick} onStar={star} /></li>)}</ul>
                  </section>
                )}
              </motion.div>
            ) : sharedToken ? (
              <motion.div key="shared" initial={enter} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.smooth }} exit={leave} className="max-w-xl mx-auto">
                {shared?.err || (shared?.s && !sharedTool) ? (
                  <div className="panel p-6 space-y-3 text-center" role="alert">
                    <p className="font-bold text-zinc-900 dark:text-white">This shared link doesn’t open</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{shared?.err ?? 'It was made with a tool that isn’t here any more.'}</p>
                    <button type="button" onClick={() => open(null)} className="btn-secondary btn-sm">Everything in Create</button>
                  </div>
                ) : <div className="h-48 rounded-2xl skeleton" aria-label="Opening the shared work" />}
              </motion.div>
            ) : (
              <motion.div key="grid" initial={enter} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.smooth }} exit={leave} className="max-w-5xl mx-auto">
                <Hub recent={recent} stars={stars} onPick={pick} onStar={star} onOpenSave={(id) => void openSave(id)} onMount={() => { if (scroller.current) scroller.current.scrollTop = gridTop.current; }} calm={!!calm} />
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
        <span className="mt-3 flex items-center gap-1.5 pe-8 font-bold text-zinc-900 dark:text-white">{t.name}{t.fresh && <span className="rounded-full bg-pink-500 px-1.5 py-px text-[11px] font-bold text-[#171f44]">New</span>}</span>
        <span className="block mt-0.5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">{t.what}</span>
      </button>
      <span className={cn('absolute top-2.5 end-2.5 transition-opacity duration-200 [@media(hover:none)]:opacity-100', starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
        <StarButton on={starred} name={t.name} onClick={() => onStar(t.id)} />
      </span>
    </div>
  );
}

/** The list of everything in Create: search, starred and recent tools, then every group. */
const NAMES = Object.fromEntries(TOOLS.map((t) => [t.id, t.name]));
function Hub({ recent, stars, onPick, onStar, onOpenSave, onMount, calm }: { recent: string[]; stars: string[]; onPick: (id: Tool['id']) => void; onStar: (id: string) => void; onOpenSave: (id: string) => void; onMount: () => void; calm: boolean }) {
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
          <SavedShelf onOpen={onOpenSave} names={NAMES} />
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
