// The Studio video editor (Stage 5 · B9.15): a list of clips (parts of videos, or pictures shown
// for a while) played one after another, text on top at set times, and music underneath. Times
// are in seconds; a clip's start / end are inside its source, the rest is on the finished video.

export interface Clip {
  id: string;
  source: string;
  kind: 'video' | 'image';
  /** How long the source is (pictures: as long as you like). */
  duration: number;
  start: number;
  end: number;
  /** The clip's own sound, 0..1. */
  volume: number;
}

export type Place = 'top' | 'middle' | 'bottom';
export interface Overlay {
  id: string;
  text: string;
  from: number;
  to: number;
  place: Place;
  /** Text height as a share of the video's height. */
  size: number;
  color: string;
  /** A dark box behind the text, like captions. */
  box: boolean;
}

export const OUTPUTS = [
  { id: 'landscape', name: 'Landscape', w: 1280, h: 720 },
  { id: 'portrait', name: 'Vertical', w: 720, h: 1280 },
  { id: 'square', name: 'Square', w: 1080, h: 1080 },
] as const;
export type OutputId = (typeof OUTPUTS)[number]['id'];

/** The shortest a clip can be. */
export const MIN_CLIP = 0.2;
/** How long a picture shows when it's added. */
export const IMAGE_SECONDS = 4;

export const clipLength = (c: Clip) => Math.max(0, c.end - c.start);
export const totalLength = (clips: Clip[]) => clips.reduce((s, c) => s + clipLength(c), 0);

/** Which clip plays at a time on the finished video, and where in its source. */
export function locate(clips: Clip[], t: number): { index: number; clip: Clip; at: number; begins: number } | null {
  let begins = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (t < begins + len || i === clips.length - 1) return { index: i, clip: clips[i], at: clips[i].start + Math.max(0, Math.min(len, t - begins)), begins };
    begins += len;
  }
  return null;
}

/** When a clip begins on the finished video. */
export const clipBegins = (clips: Clip[], index: number) => totalLength(clips.slice(0, index));

/** The clip under a time cut in two there (nothing happens too near either end). */
export function splitAt(clips: Clip[], t: number, newId: () => string): Clip[] {
  const hit = locate(clips, t);
  if (!hit || hit.at - hit.clip.start < MIN_CLIP || hit.clip.end - hit.at < MIN_CLIP) return clips;
  const a = { ...hit.clip, end: hit.at }, b = { ...hit.clip, id: newId(), start: hit.at };
  return [...clips.slice(0, hit.index), a, b, ...clips.slice(hit.index + 1)];
}

export function moveClip<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** New start and end for a clip, kept inside its source and at least MIN_CLIP long. */
export function retrim(c: Clip, start: number, end: number): Clip {
  if (c.kind === 'image') return { ...c, start: 0, end: Math.max(MIN_CLIP, Math.min(600, end - start)) };
  const s = Math.max(0, Math.min(c.duration - MIN_CLIP, start));
  return { ...c, start: s, end: Math.max(s + MIN_CLIP, Math.min(c.duration, end)) };
}

export const overlaysAt = (list: Overlay[], t: number) => list.filter((o) => t >= o.from && t < o.to);

/** Text broken into lines that fit a width (long words are kept whole). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Where a picture of one size goes in a frame: all of it showing (fit) or filling the frame (fill). */
export function fitRect(sw: number, sh: number, w: number, h: number, mode: 'fit' | 'fill') {
  const k = mode === 'fit' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  const dw = sw * k, dh = sh * k;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

const stamp = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const secondsOf = (m: RegExpMatchArray) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;

/** Captions from an .srt or .vtt file. */
export function parseCaptions(text: string): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const ma = a.match(stamp), mb = b?.match(stamp);
    if (!ma || !mb) continue;
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (body) out.push({ from: secondsOf(ma), to: secondsOf(mb), text: body.slice(0, 300) });
  }
  return out.slice(0, 500);
}

const vttTime = (s: number) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

/** The text as a .vtt captions file (for players and uploads). */
export function toVtt(list: Overlay[]): string {
  return ['WEBVTT', '', ...[...list].sort((a, b) => a.from - b.from).flatMap((o) => [`${vttTime(o.from)} --> ${vttTime(o.to)}`, o.text, ''])].join('\n');
}

/** The best recording format this browser has: MP4 if it can, otherwise WebM. */
export function pickFormat(supported: (type: string) => boolean): { type: string; ext: 'mp4' | 'webm' } | null {
  const tries: [string, 'mp4' | 'webm'][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
  ];
  for (const [type, ext] of tries) if (supported(type)) return { type, ext };
  return null;
}
