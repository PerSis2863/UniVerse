'use client';
import { FileText } from 'lucide-react';
import { safeHref } from '@/lib/safe-href';
import { ChatVideo, VoicePlayer } from './MessageBubble';

// A chat attachment shown where it is: voice notes and audio play on the page, videos play in
// place, photos show; other files open as a link. (Opening a voice note in its own tab showed an
// empty 0:00 player.)
export function AttachmentInline({ url, name, mime, type, durationSec }: { url: string; name?: string | null; mime?: string | null; type?: string; durationSec?: number }) {
  const kind = type === 'AUDIO' || /^audio\//.test(mime ?? '') || (/\.(webm|ogg|m4a|mp3|wav)$/i.test(name ?? '') && type !== 'VIDEO' && !/^video\//.test(mime ?? '')) ? 'audio'
    : type === 'VIDEO' || /^video\//.test(mime ?? '') ? 'video'
    : type === 'IMAGE' || /^image\//.test(mime ?? '') ? 'image' : 'file';
  if (kind === 'audio') return <div className="rounded-xl bg-indigo-600 text-white pb-2 w-fit max-w-full"><VoicePlayer src={url} mine durationSec={durationSec} /></div>;
  if (kind === 'video') return <ChatVideo url={url} />;
  if (kind === 'image') return <img src={url} alt={name ?? ''} loading="lazy" className="rounded-xl max-h-60 max-w-full object-cover" />;
  return (
    <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400">
      <FileText className="w-3.5 h-3.5" />{name || 'File'}
    </a>
  );
}
