'use client';

import dynamic from 'next/dynamic';
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

// Every tool in Collaborate → Create (M76: moved out of the Create page so the public shared-link page
// /s/<token> can show the same tools). Each set is its own download (dynamic import).

// Each set of tools is its own download, fetched when a tool is opened, or a moment before: when the
// pointer rests on its card (M72), so tools open at once.
export const LOAD = {
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
export const toolLoading = () => <div className="h-48 rounded-2xl skeleton" />;
export const QuickTool = dynamic(() => LOAD.quick().then((m) => m.QuickTool), { ssr: false, loading: toolLoading });
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

export type Pdf3 = `pdf-${PdfId}`;
export type Panel = 'convert' | 'compress' | 'photo' | 'audio' | 'notes' | QuickId | Pdf3 | MoreId | `img-${ImageId}` | PlanId | StudyId | DataId | MakerId | WordId | OrganiseId | ClassId | MoneyId | MediaId | DevId | PenId | LifeId | ScienceId | CalcId | StageId | ArtId | WebId;
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
export const PANELS: Panel[] = ['convert', 'compress', 'photo', 'audio', 'notes', ...QUICK, 'pdf-merge', 'pdf-split', 'pdf-images', ...MORE, ...IMAGES.map((i) => `img-${i}` as const), ...PLAN, ...STUDY, ...DATA, ...MAKER, ...WORD, ...ORGANISE, ...CLASS, ...MONEY, ...MEDIA, ...DEV, ...PEN, ...LIFE, ...SCIENCE, ...CALC, ...STAGE, ...ART, ...WEB];
/** Tools that need the whole width (boards, timelines, editors with a preview). */
export const WIDE = new Set<string>(['mindmap', 'stickies', 'gantt', 'timetable', 'flow', 'cv', 'playground', 'explore', 'zones', 'wordsearch', 'rubric', 'graph', 'habits', 'periodic', 'week', 'matrix', 'swot', 'journal', 'seating', 'dice', 'meeting', 'goals', 'colourblind', 'shadow', 'kanban', 'times', 'venn', 'history', 'regression', 'bingo', 'gameboard', 'poster', 'bizcard', 'drums', 'piano', 'sqlgen', 'jsonts', 'metatags', 'flexbox', 'essay', 'cornell', 'trip', 'dayplan', 'raci', 'queue']);
export const setOf = (id: string): keyof typeof LOAD | null =>
  id === 'notes' ? 'notes' : id.startsWith('pdf-') ? 'pdf' : id.startsWith('img-') ? 'image' : (MORE as string[]).includes(id) ? 'more' : (QUICK as string[]).includes(id) ? 'quick'
    : (PLAN as string[]).includes(id) ? 'plan' : (STUDY as string[]).includes(id) ? 'study' : (DATA as string[]).includes(id) ? 'data' : (MAKER as string[]).includes(id) ? 'maker'
    : (WORD as string[]).includes(id) ? 'word' : (ORGANISE as string[]).includes(id) ? 'organise' : (CLASS as string[]).includes(id) ? 'class'
    : (MONEY as string[]).includes(id) ? 'money' : (MEDIA as string[]).includes(id) ? 'media' : (DEV as string[]).includes(id) ? 'dev'
    : (PEN as string[]).includes(id) ? 'pen' : (LIFE as string[]).includes(id) ? 'life' : (SCIENCE as string[]).includes(id) ? 'science' : (CALC as string[]).includes(id) ? 'calc' : (STAGE as string[]).includes(id) ? 'stage' : (ART as string[]).includes(id) ? 'art' : (WEB as string[]).includes(id) ? 'web' : null;
export const preload = (id: string) => { const k = setOf(id); if (k) void LOAD[k]().catch(() => {}); };

/** The tool itself (for every tool in a set; null for the editors opened elsewhere). */
export function ToolBody({ panel }: { panel: Panel }) {
  const set = setOf(panel);
  if (!set) return null;
  return set === 'notes' ? <QuickNotes />
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
: <QuickTool id={panel as QuickId} />;
}
