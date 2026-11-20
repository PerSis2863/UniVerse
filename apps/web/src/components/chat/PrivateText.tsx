'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Lock } from 'lucide-react';
import type { E2EPayload } from '@/lib/e2e';
import { cn } from '@/lib/utils';
import { RichText } from './RichText';
import { decryptForChat } from './private-chat';
import { decryptFile, readEnvelope, type PrivateFile } from '@/lib/e2e-file';
import { formatBytes } from './chat-client';

// A private (end-to-end encrypted) message, decrypted on this device (Stage 5 · B7.6). Sent
// before this device joined, or on a device whose key is gone: it says so, honestly.

export function PrivateText({ conversationId, me, messageId, payload, mine, onText }: { conversationId: string; me: string; messageId: string; payload: E2EPayload; mine: boolean; onText?: (text: string) => void }) {
  const [state, setState] = useState<{ text: string } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    decryptForChat(conversationId, me, messageId, payload).then(
      (text) => { if (live) { setState({ text }); const f = readEnvelope(text); onText?.(f ? f.caption ?? f.name : text); } },
      (e: Error) => { if (live) setState({ error: e.message }); },
    );
    return () => { live = false; };
  }, [conversationId, me, messageId, payload, onText]);
  if (!state) return <p className={cn('text-sm italic', mine ? 'text-white/70' : 'text-zinc-500')}>Decrypting…</p>;
  if ('error' in state) {
    return (
      <p className={cn('text-sm italic flex items-center gap-1.5', mine ? 'text-white/80' : 'text-zinc-500')}>
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />
        {state.error === 'not-for-this-device' ? 'Sent before this device joined the private chat, so it can’t be read here.' : state.error === 'unsupported' ? 'This browser can’t open private messages.' : 'Couldn’t decrypt this message.'}
      </p>
    );
  }
  const file = readEnvelope(state.text);
  if (file) return <PrivateAttachment file={file} mine={mine} />;
  return <RichText text={state.text} mine={mine} />;
}

/** M341: a private chat's photo, video, voice note or file: downloaded scrambled, opened here with the key the message
 *  carried (src/lib/e2e-file.ts). Photos, videos and voice notes open at once; other files when tapped. */
/** The file opened: fetched scrambled, decrypted here, as an address only this page can use. */
async function openFile(file: PrivateFile): Promise<string> {
  const res = await fetch(file.url);
  if (!res.ok) throw new Error('gone');
  const bytes = await decryptFile(await res.arrayBuffer(), file.k, file.iv);
  return URL.createObjectURL(new Blob([bytes], { type: file.mime }));
}

function PrivateAttachment({ file, mine }: { file: PrivateFile; mine: boolean }) {
  const media = file.kind !== 'file';
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error'>(media ? 'busy' : 'idle');
  useEffect(() => {
    if (!media) return;
    let live = true, made: string | null = null;
    openFile(file).then((u) => { made = u; if (live) { setUrl(u); setState('idle'); } else URL.revokeObjectURL(u); }, () => { if (live) setState('error'); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [file, media]);
  const note = <span className={cn('flex items-center gap-1 text-[11px] mt-1', mine ? 'text-white/70' : 'text-zinc-500')}><Lock className="w-3 h-3" aria-hidden />End-to-end encrypted</span>;
  if (state === 'error') return <p className={cn('text-sm italic flex items-center gap-1.5', mine ? 'text-white/80' : 'text-zinc-500')}><Lock className="w-3.5 h-3.5 shrink-0" aria-hidden />Couldn’t open this file.</p>;
  const caption = file.caption ? <div className="mt-2"><RichText text={file.caption} mine={mine} /></div> : null;
  if (file.kind === 'image') {
    return <div>{url ? <img src={url} alt={file.caption || file.name} className="block max-w-full max-h-80 rounded-xl" /> : <div className="w-56 h-40 rounded-xl skeleton" aria-label="Opening the photo" role="status" />}{caption}{note}</div>;
  }
  if (file.kind === 'video') {
    return <div>{url ? <video src={url} controls playsInline className="block max-w-full max-h-80 rounded-xl" /> : <div className="w-56 h-40 rounded-xl skeleton" aria-label="Opening the video" role="status" />}{caption}{note}</div>;
  }
  if (file.kind === 'audio') {
    return <div className="w-64 max-w-full">{url ? <audio src={url} controls className="w-full h-10" aria-label="Voice message" /> : <div className="h-10 rounded-full skeleton" aria-label="Opening the voice message" role="status" />}{caption}{note}</div>;
  }
  const download = async () => {
    let u = url;
    if (!u) {
      setState('busy');
      try { u = await openFile(file); setUrl(u); setState('idle'); } catch { setState('error'); return; }
    }
    const a = document.createElement('a');
    a.href = u; a.download = file.name; a.click();
  };
  return (
    <div className="w-64 max-w-full">
      <button type="button" onClick={() => void download()} className={cn('w-full flex items-center gap-3 rounded-xl p-2 text-start', mine ? 'bg-white/15 hover:bg-white/20' : 'bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200/70 dark:hover:bg-white/10')}>
        <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', mine ? 'bg-white/20' : 'bg-white dark:bg-white/10')}><FileText className="w-5 h-5" aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate" translate="no">{file.name}</span><span className={cn('block text-xs', mine ? 'text-white/70' : 'text-zinc-500')}>{formatBytes(file.size)}</span></span>
        {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-label="Opening" /> : <Download className="w-4 h-4 shrink-0" aria-hidden />}
      </button>
      {caption}{note}
    </div>
  );
}
