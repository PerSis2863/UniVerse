'use client';

import { useState } from 'react';
import { Ban, Check, CheckCheck, Copy, CornerUpLeft, Download, FileText, MoreVertical, Pencil, Phone, SmilePlus, Trash2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ChatMessage, REACTIONS, formatBytes } from './chat-client';

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;

function RichText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {text.split(URL_SPLIT).map((part, i) =>
        /^https?:\/\/\S+$/.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={cn('underline underline-offset-2 break-all', mine ? 'text-white' : 'text-indigo-500 dark:text-indigo-300')}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export function Avatar({ name, src, size = 40, online }: { name: string; src?: string | null; size?: number; online?: boolean }) {
  const letters = name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-white font-bold" style={{ fontSize: size * 0.36 }}>
          {letters}
        </div>
      )}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0f1322]" />}
    </div>
  );
}

interface Props {
  m: ChatMessage;
  mine: boolean;
  me: string;
  showSender: boolean;
  readState: 'sent' | 'read' | null;
  canModerate: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onOpenImage: (url: string) => void;
}

export function MessageBubble({ m, mine, me, showSender, readState, canModerate, onReply, onEdit, onDelete, onReact, onOpenImage }: Props) {
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const time = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const deleted = m.type === 'DELETED';
  const canEdit = mine && m.type === 'TEXT' && !deleted && Date.now() - new Date(m.createdAt).getTime() < 86_400_000;
  const reactionEntries = Object.entries(m.reactions ?? {}).filter(([, users]) => users.length > 0);

  if (m.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] px-3 py-1 rounded-full bg-zinc-200/70 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400">{m.body}</span>
      </div>
    );
  }

  const bubble = cn(
    'relative max-w-[min(78%,34rem)] rounded-2xl text-sm shadow-sm',
    mine
      ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-md'
      : 'bg-white dark:bg-white/[0.07] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/[0.06] rounded-bl-md',
    m.pending && 'opacity-60',
  );

  const meta = (
    <span className={cn('inline-flex items-center gap-1 text-[10px] leading-none select-none', mine ? 'text-white/70' : 'text-zinc-400')}>
      {m.editedAt && !deleted && 'edited ·'} {time}
      {mine && !deleted && (m.pending ? <Check className="w-3 h-3" /> : readState === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" /> : <CheckCheck className="w-3.5 h-3.5" />)}
    </span>
  );

  let content: React.ReactNode;
  if (deleted) {
    content = <p className="px-3.5 py-2.5 italic opacity-70 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> This message was deleted</p>;
  } else if (m.type === 'IMAGE' && m.attachmentUrl) {
    content = (
      <button onClick={() => onOpenImage(m.attachmentUrl!)} className="block p-1">
        <img src={m.attachmentUrl} alt={m.attachmentName || 'Photo'} loading="lazy" className="rounded-xl max-h-80 w-auto object-cover" />
      </button>
    );
  } else if (m.type === 'VIDEO' && m.attachmentUrl) {
    content = <video src={m.attachmentUrl} controls preload="metadata" className="rounded-xl max-h-80 m-1" />;
  } else if (m.type === 'AUDIO' && m.attachmentUrl) {
    content = <div className="px-2 pt-2 w-60 max-w-full"><audio src={m.attachmentUrl} controls preload="metadata" className="h-10 w-full" /></div>;
  } else if (m.type === 'FILE' && m.attachmentUrl) {
    content = (
      <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 min-w-[14rem]">
        <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', mine ? 'bg-white/15' : 'bg-indigo-500/10 text-indigo-500')}>
          <FileText className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate">{m.attachmentName || 'File'}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>{formatBytes(m.attachmentSize)}</span>
        </span>
        <Download className="w-4 h-4 opacity-70" />
      </a>
    );
  } else if (m.type === 'CALL') {
    const video = m.metadata?.kind === 'video';
    const fresh = Date.now() - new Date(m.createdAt).getTime() < 60 * 60 * 1000;
    content = (
      <div className="flex items-center gap-3 p-3 min-w-[15rem]">
        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', mine ? 'bg-white/15' : 'bg-emerald-500/15 text-emerald-500')}>
          {video ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
        </span>
        <span className="flex-1">
          <span className="block font-semibold">{video ? 'Video call' : 'Voice call'}</span>
          <span className={cn('block text-[11px]', mine ? 'text-white/70' : 'text-zinc-500')}>{mine ? 'You started a call' : `${m.sender.name.split(' ')[0]} is calling`}</span>
        </span>
        {m.metadata?.url && fresh && (
          <a href={m.metadata.url} target="_blank" rel="noopener noreferrer" className={cn('px-3 py-1.5 rounded-full text-xs font-bold', mine ? 'bg-white text-indigo-600' : 'bg-emerald-500 text-white')}>
            Join
          </a>
        )}
      </div>
    );
  } else {
    content = <div className="px-3.5 py-2.5"><RichText text={m.body} mine={mine} /></div>;
  }

  return (
    <div className={cn('group flex gap-2 items-end', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
        {showSender && !mine && <span className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-300 mb-1 ml-2">{m.sender.name}</span>}
        <div className={cn('flex items-center gap-1', mine && 'flex-row-reverse')}>
          <div className={bubble}>
            {m.replyTo && !deleted && (
              <div className={cn('mx-2 mt-2 px-3 py-1.5 rounded-lg border-l-4 text-xs', mine ? 'bg-white/10 border-white/60' : 'bg-zinc-100 dark:bg-white/[0.05] border-indigo-400')}>
                <p className="font-semibold">{m.replyTo.sender.id === me ? 'You' : m.replyTo.sender.name}</p>
                <p className="opacity-80 line-clamp-2">{m.replyTo.body || (m.replyTo.type === 'TEXT' ? 'Message deleted' : 'Attachment')}</p>
              </div>
            )}
            {content}
            {m.type !== 'TEXT' || deleted ? (
              <div className="flex justify-end px-3 pb-2">{meta}</div>
            ) : (
              <div className="flex justify-end px-3 pb-2 -mt-1">{meta}</div>
            )}
          </div>

          {!deleted && !m.pending && (
            <div className="relative opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button onClick={() => { setPicker((v) => !v); setMenu(false); }} aria-label="React" className="p-1.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                <SmilePlus className="w-4 h-4" />
              </button>
              <button onClick={() => { setMenu((v) => !v); setPicker(false); }} aria-label="Message options" className="p-1.5 rounded-full text-zinc-400 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
                <MoreVertical className="w-4 h-4" />
              </button>
              {picker && (
                <div className={cn('absolute z-20 bottom-full mb-1 flex gap-1 p-1.5 rounded-full bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-xl', mine ? 'right-0' : 'left-0')}>
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => { onReact(e); setPicker(false); }} className="w-8 h-8 rounded-full text-lg hover:bg-zinc-100 dark:hover:bg-white/10 hover:scale-125 transition-transform">{e}</button>
                  ))}
                </div>
              )}
              {menu && (
                <div className={cn('absolute z-20 bottom-full mb-1 w-40 py-1 rounded-xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-xl text-sm', mine ? 'right-0' : 'left-0')} onMouseLeave={() => setMenu(false)}>
                  <MenuItem icon={CornerUpLeft} label="Reply" onClick={() => { onReply(); setMenu(false); }} />
                  {m.type === 'TEXT' && <MenuItem icon={Copy} label="Copy" onClick={() => { navigator.clipboard.writeText(m.body); setMenu(false); }} />}
                  {canEdit && <MenuItem icon={Pencil} label="Edit" onClick={() => { onEdit(); setMenu(false); }} />}
                  {(mine || canModerate) && <MenuItem icon={Trash2} label="Delete for everyone" danger onClick={() => { onDelete(); setMenu(false); }} />}
                </div>
              )}
            </div>
          )}
        </div>

        {reactionEntries.length > 0 && (
          <div className={cn('flex gap-1 -mt-1.5 z-10', mine ? 'mr-2' : 'ml-2')}>
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className={cn('px-1.5 py-0.5 rounded-full text-xs border shadow-sm', users.includes(me) ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-400/40' : 'bg-white dark:bg-[#161b2e] border-zinc-200 dark:border-white/10')}
              >
                {emoji} {users.length > 1 && <span className="text-zinc-600 dark:text-zinc-300">{users.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.06]', danger ? 'text-rose-500' : 'text-zinc-700 dark:text-zinc-200')}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
