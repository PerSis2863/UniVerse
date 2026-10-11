'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2, Printer } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { exportFileName, toHtml, toText, type ExportMessage } from '@/lib/chat-export';
import { plainText, previewText, type ChatMessage, type ThreadResponse } from './chat-client';

// Export a chat (Stage 5 · B7.8; src/lib/chat-export.ts): its messages fetched page by page (a short
// pause between pages, to go easy on the server) and made into a file on this device: a readable
// page, plain text, JSON, or printed to PDF. Up to 2,000 messages, newest kept.

const PAGES = 40;
type Format = 'html' | 'txt' | 'json' | 'pdf';

function shape(m: ChatMessage, me: string): ExportMessage {
  const deleted = !!m.deletedAt || m.type === 'DELETED';
  const text = deleted ? '[deleted]' : m.type === 'TEXT' ? plainText(m.body) : m.type === 'IMAGE' || m.type === 'FILE' || m.type === 'VIDEO' || m.type === 'AUDIO' ? m.body ? plainText(m.body) : '' : previewText(m);
  return {
    at: m.createdAt,
    from: m.sender?.id === me ? 'You' : m.sender?.name ?? 'Someone',
    type: m.type,
    text,
    attachment: !deleted && m.attachmentUrl ? { name: m.attachmentName || m.type.toLowerCase(), url: new URL(m.attachmentUrl, window.location.origin).href } : null,
    replyTo: m.replyTo ? { from: m.replyTo.sender.id === me ? 'You' : m.replyTo.sender.name, text: plainText(m.replyTo.body) } : null,
    edited: !!m.editedAt && !deleted,
    reactions: Object.fromEntries(Object.entries(m.reactions ?? {}).map(([e, ids]) => [e, ids.length]).filter(([, n]) => Number(n) > 0)),
  };
}

export function ChatExport({ conversationId, title }: { conversationId: string; title: string }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [count, setCount] = useState(0);
  const run = async (fmt: Format) => {
    setBusy(fmt);
    setCount(0);
    try {
      let all: ChatMessage[] = [];
      let me = '';
      let before: string | null = null;
      for (let i = 0; i < PAGES; i++) {
        const res: ThreadResponse = await authedJson<ThreadResponse>(`/api/chat/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`);
        me = res.me;
        all = [...res.messages.filter((m) => !m.pending), ...all];
        setCount(all.length);
        if (!res.hasMore || !res.messages.length) break;
        before = res.messages[0].createdAt;
        await new Promise((r) => setTimeout(r, 120));
      }
      const messages = all.filter((m) => m.type !== 'SYSTEM').map((m) => shape(m, me));
      const now = new Date().toISOString();
      if (fmt === 'pdf') {
        // Printed from a hidden frame: the browser's print dialog can save it as a PDF.
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        frame.srcdoc = toHtml(title, messages, now);
        frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); };
        document.body.appendChild(frame);
      } else {
        const body = fmt === 'json' ? JSON.stringify({ chat: { id: conversationId, title, exportedAt: now }, messages }, null, 2) : fmt === 'txt' ? toText(title, messages, now) : toHtml(title, messages, now);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([body], { type: fmt === 'json' ? 'application/json' : fmt === 'txt' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8' }));
        a.download = exportFileName(title, fmt, now);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast.success(`Exported ${messages.length} message${messages.length === 1 ? '' : 's'}`, { description: all.length >= PAGES * 50 ? 'The newest 2,000 messages.' : undefined });
      }
    } catch (e) { toast.error((e as Error).message || 'Couldn’t export the chat.'); }
    finally { setBusy(null); }
  };
  const btn = 'flex flex-col items-center gap-1 rounded-xl border border-zinc-200 dark:border-white/10 py-2.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-indigo-400/60 disabled:opacity-50';
  return (
    <div className="p-5 border-b border-zinc-200/70 dark:border-white/[0.07]">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Export chat</p>
      <p className="text-[11px] text-zinc-500 mb-3">A copy on this device. Others in the chat aren’t told.</p>
      <div className="grid grid-cols-4 gap-2">
        {([['html', 'Page', Download], ['pdf', 'PDF', Printer], ['txt', 'Text', FileText], ['json', 'JSON', FileJson]] as const).map(([fmt, label, Icon]) => (
          <button key={fmt} type="button" onClick={() => void run(fmt)} disabled={!!busy} aria-label={`Export as ${label}`} className={btn}>
            {busy === fmt ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Icon className="w-4 h-4" aria-hidden />}{label}
          </button>
        ))}
      </div>
      {busy && <p className="text-[11px] text-zinc-500 mt-2" role="status">Gathering messages… {count}</p>}
    </div>
  );
}
