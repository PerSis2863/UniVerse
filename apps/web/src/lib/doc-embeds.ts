import { youtubeId } from '@/lib/app-links';
import { isUploadedFileUrl } from '@/lib/file-urls';

// Things put inside a document (Stage 5 · B9.5): a video, a PDF, a whiteboard, a live task board,
// code that runs, or maths. One "embed" block holds any of them; only safe sources are allowed
// (YouTube, files uploaded here, and this app's own boards).

export type EmbedKind = 'youtube' | 'video' | 'pdf' | 'board' | 'tasks' | 'code' | 'math';
export interface EmbedAttrs { kind: EmbedKind; src: string; title: string; lang: string; code: string; tex: string }

export const EMBED_LABEL: Record<EmbedKind, string> = { youtube: 'Video', video: 'Video', pdf: 'PDF', board: 'Whiteboard', tasks: 'Task board', code: 'Code', math: 'Maths' };
const ID = /^[a-z0-9]{20,32}$/i;

/** A video address as an embed: a YouTube link, or a video uploaded here. */
export function videoEmbed(url: string): Pick<EmbedAttrs, 'kind' | 'src'> | null {
  const t = url.trim();
  const yt = youtubeId(t);
  if (yt) return { kind: 'youtube', src: yt };
  return isUploadedFileUrl(t) ? { kind: 'video', src: t } : null;
}

/** Whether an embed's source is one this app shows (anything else is shown as nothing). */
export function safeEmbed(a: Pick<EmbedAttrs, 'kind' | 'src'>): boolean {
  switch (a.kind) {
    case 'youtube': return /^[A-Za-z0-9_-]{11}$/.test(a.src);
    case 'video': case 'pdf': return isUploadedFileUrl(a.src);
    case 'board': case 'tasks': return ID.test(a.src);
    case 'code': case 'math': return true;
    default: return false;
  }
}

/** Where an embed lives, for downloads (Markdown and Word links). */
export function embedHref(a: Pick<EmbedAttrs, 'kind' | 'src'>, origin = ''): string | null {
  if (!safeEmbed(a)) return null;
  const abs = (p: string) => (p.startsWith('/') ? `${origin}${p}` : p);
  switch (a.kind) {
    case 'youtube': return `https://www.youtube.com/watch?v=${a.src}`;
    case 'video': case 'pdf': return abs(a.src);
    case 'board': return `${origin}/boards/${a.src}`;
    case 'tasks': return `${origin}/tasks/${a.src}`;
    default: return null;
  }
}
