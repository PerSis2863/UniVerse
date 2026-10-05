'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BarChart3, Camera, FileText, Flame, ImageIcon, Languages, Loader2, MapPin, Mic, Paperclip, Pencil, Send, Smile, Trash2, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ChatMessage, chatJson } from './chat-client';
import { LanguagePicker } from './LanguagePicker';
import { languageName } from '@/lib/languages';

const EMOJIS = ['😀', '😂', '😊', '😍', '🥳', '😎', '🤔', '😅', '😢', '😡', '👍', '👎', '🙏', '👏', '🙌', '💪', '🔥', '✨', '❤️', '💯', '🎉', '✅', '📚', '🌍', '🌱', '💡', '🚀', '⭐', '☕', '👋'];

export interface SendPayload {
  text?: string;
  file?: File;
  voice?: { blob: Blob; durationSec: number };
  /** Photo, video or voice message that each person can open only once. */
  viewOnce?: boolean;
}

export type ComposerExtra = 'poll' | 'location' | 'contact';

interface Props {
  disabled?: boolean;
  replyTo: ChatMessage | null;
  editing: ChatMessage | null;
  uploadProgress: number | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (p: SendPayload) => Promise<void>;
  onSaveEdit: (text: string) => Promise<void>;
  onTyping: () => void;
  onExtra: (kind: ComposerExtra) => void;
  mentionables?: { id: string; name: string }[];
  /** Suggested languages for translating a draft (e.g. the ones others write in here). */
  draftLanguages?: string[];
}

export function Composer({ disabled, replyTo, editing, uploadProgress, onCancelReply, onCancelEdit, onSend, onSaveEdit, onTyping, onExtra, mentionables = [], draftLanguages = [] }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // View once for the next photo, video or voice message (a ref too: the recorder's callback reads it).
  const [once, setOnceState] = useState(false);
  const onceRef = useRef(false);
  const setOnce = (v: boolean) => { onceRef.current = v; setOnceState(v); };
  const [emoji, setEmoji] = useState(false);
  const [attach, setAttach] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [recording, setRecording] = useState<{ start: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const mediaRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    if (editing) {
      setText(editing.body);
      areaRef.current?.focus();
    }
  }, [editing]);
  useEffect(() => { if (replyTo) areaRef.current?.focus(); }, [replyTo]);

  // Replaces the draft with its translation; "Undo" puts the original back.
  const translateDraft = async (to: string) => {
    setTranslateOpen(false);
    const original = text;
    setTranslating(true);
    try {
      const r = await chatJson<{ text: string; from: string }>('/api/chat/translate-draft', { method: 'POST', body: JSON.stringify({ text: original, to }) });
      if (r.text === original || r.from === to) { toast(`Your message is already in ${languageName(to)}.`); return; }
      setText(r.text);
      toast.success(`Translated into ${languageName(to)}`, { action: { label: 'Undo', onClick: () => { setText(original); areaRef.current?.focus(); } } });
      areaRef.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranslating(false);
    }
  };

  // Auto-grow the textarea.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - recording.start) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (editing) await onSaveEdit(value);
      else await onSend({ text: value });
      setText('');
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    setAttach(false);
    if (!file) return;
    setBusy(true);
    try {
      const once = onceRef.current && /^(image|video)\//.test(file.type);
      await onSend({ file, text: once ? undefined : text.trim() || undefined, viewOnce: once || undefined });
      setOnce(false);
      if (!once) setText('');
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return void toast.error('Voice messages aren’t supported in this browser.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      const start = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        setElapsed(0);
        if (cancelled.current || chunks.current.length === 0) return;
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const durationSec = Math.max(1, Math.round((Date.now() - start) / 1000));
        setBusy(true);
        try { await onSend({ voice: { blob, durationSec }, viewOnce: onceRef.current || undefined }); } finally { setBusy(false); setOnce(false); }
      };
      rec.start();
      recorder.current = rec;
      setRecording({ start });
    } catch {
      toast.error('Microphone access was blocked. Allow it in your browser settings to record voice messages.');
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelled.current = cancel;
    recorder.current?.stop();
  };

  if (disabled) {
    return (
      <div className="px-4 py-3 text-center text-xs text-zinc-500 border-t border-zinc-200/80 dark:border-white/[0.06]">
        This is an official UniVerse Impact channel. Replies aren’t monitored — visit Support if you need help.
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl px-3 md:px-4 py-3">
      {(replyTo || editing) && (
        <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border-l-4 border-indigo-500">
          {editing ? <Pencil className="w-4 h-4 text-indigo-500 shrink-0" /> : null}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-indigo-600 dark:text-indigo-300">{editing ? 'Editing message' : `Replying to ${replyTo!.sender.name}`}</p>
            {!editing && <p className="text-zinc-600 dark:text-zinc-400 truncate">{replyTo!.body || 'Attachment'}</p>}
          </div>
          <button onClick={() => { if (editing) { onCancelEdit(); setText(''); } else onCancelReply(); }} aria-label="Cancel" className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadProgress !== null && (
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading… {uploadProgress}%
          <div className="flex-1 h-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3">
          <button onClick={() => stopRecording(true)} aria-label="Discard recording" className="p-2.5 rounded-full text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-5 h-5" /></button>
          <div className="flex-1 flex items-center gap-3 px-4 h-11 rounded-full bg-zinc-100 dark:bg-white/[0.06]">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
            <span className="text-xs text-zinc-500">Recording voice message…</span>
          </div>
          <button onClick={() => setOnce(!once)} aria-pressed={once} aria-label="View once" title="View once: they can play it one time" className={cn('w-9 h-9 rounded-full flex items-center justify-center border-2 border-dashed transition-colors', once ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-600 text-zinc-500')}><Flame className="w-4 h-4" /></button>
          <button onClick={() => stopRecording(false)} aria-label="Send voice message" className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg">
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="relative">
            <button onClick={() => { setEmoji((v) => !v); setAttach(false); setTranslateOpen(false); }} aria-label="Emoji" className="p-2.5 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06]">
              <Smile className="w-5 h-5" />
            </button>
            {emoji && (
              <div className="absolute bottom-full mb-2 left-0 z-30 w-72 max-w-[calc(100vw-1.5rem)] p-2 grid grid-cols-8 gap-1 rounded-2xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-2xl">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => { setText((t) => t + e); areaRef.current?.focus(); }} className="w-8 h-8 rounded-lg text-lg hover:bg-zinc-100 dark:hover:bg-white/10">{e}</button>
                ))}
              </div>
            )}
          </div>
          {text.trim().length > 1 && (
            <div className="relative">
              <button onClick={() => { setTranslateOpen((v) => !v); setEmoji(false); setAttach(false); }} disabled={translating} aria-label="Translate before sending" title="Translate before sending" aria-expanded={translateOpen} className={cn('p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-60', translateOpen ? 'text-indigo-500' : 'text-zinc-500 hover:text-indigo-500')}>
                {translating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
              </button>
              {translateOpen && (
                <LanguagePicker title="Translate my message into" placement="above" align="left" value={null} suggested={[...new Set(draftLanguages)]} onPick={(l) => l && void translateDraft(l)} onClose={() => setTranslateOpen(false)} />
              )}
            </div>
          )}
          {!editing && (
            <div className="relative">
              <button onClick={() => { setAttach((v) => !v); setEmoji(false); setTranslateOpen(false); }} disabled={busy} aria-label="Attach" className="p-2.5 rounded-full text-zinc-500 hover:text-indigo-500 hover:bg-zinc-100 dark:hover:bg-white/[0.06] disabled:opacity-50">
                <Paperclip className="w-5 h-5" />
              </button>
              {attach && (
                <div className="absolute bottom-full mb-2 left-0 z-30 w-52 p-1.5 rounded-2xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-2xl text-sm">
                  <button onClick={() => mediaRef.current?.click()} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-500 flex items-center justify-center"><ImageIcon className="w-4 h-4" /></span> Photos & videos
                  </button>
                  <button onClick={() => cameraRef.current?.click()} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center"><Camera className="w-4 h-4" /></span> Camera
                  </button>
                  <button onClick={() => docRef.current?.click()} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-indigo-500/15 text-indigo-500 flex items-center justify-center"><FileText className="w-4 h-4" /></span> Document
                  </button>
                  <button onClick={() => setOnce(!once)} role="switch" aria-checked={once} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className={cn('w-8 h-8 rounded-full flex items-center justify-center border-2 border-dashed', once ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 dark:border-zinc-600 text-zinc-500')}><Flame className="w-4 h-4" /></span>
                    <span className="flex-1 text-left">View once</span>
                    <span className={cn('text-[10px] font-bold uppercase', once ? 'text-indigo-500' : 'text-zinc-400')}>{once ? 'On' : 'Off'}</span>
                  </button>
                  <button onClick={() => { setAttach(false); onExtra('poll'); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center"><BarChart3 className="w-4 h-4" /></span> Poll
                  </button>
                  <button onClick={() => { setAttach(false); onExtra('location'); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center"><MapPin className="w-4 h-4" /></span> Location
                  </button>
                  <button onClick={() => { setAttach(false); onExtra('contact'); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                    <span className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-500 flex items-center justify-center"><UserRound className="w-4 h-4" /></span> Contact
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="relative flex-1 min-w-0 flex">
          {mentionQuery !== null && (() => {
            const list = mentionables.filter((u) => u.name.toLowerCase().includes(mentionQuery)).slice(0, 6);
            if (!list.length) return null;
            return (
              <div className="absolute bottom-full mb-2 left-0 z-30 w-64 max-w-[calc(100vw-1.5rem)] py-1 rounded-2xl bg-white dark:bg-[#161b2e] border border-zinc-200 dark:border-white/10 shadow-2xl">
                {list.map((u) => (
                  <button key={u.id} onMouseDown={(e) => {
                    e.preventDefault();
                    const el = areaRef.current!;
                    const pos = el.selectionStart ?? text.length;
                    const before = text.slice(0, pos).replace(/@[\w.-]*$/, `@${u.name.split(' ')[0]} `);
                    setText(before + text.slice(pos));
                    setMentionQuery(null);
                    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
                  }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-800 dark:text-zinc-100">
                    @{u.name}
                  </button>
                ))}
              </div>
            );
          })()}
          <textarea
            ref={areaRef}
            rows={1}
            value={text}
            maxLength={4000}
            onChange={(e) => {
              setText(e.target.value);
              if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); onTyping(); }
              const upto = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
              const at = /(?:^|\s)@([\w.-]*)$/.exec(upto);
              setMentionQuery(mentionables.length && at ? at[1].toLowerCase() : null);
            }}
            onPaste={(e) => {
              const f = Array.from(e.clipboardData.files ?? []).find((x) => x.type.startsWith('image/'));
              if (f && !editing) { e.preventDefault(); pickFile(f); }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              if (e.key === 'Escape' && editing) { onCancelEdit(); setText(''); }
            }}
            placeholder={editing ? 'Edit your message' : 'Type a message'}
            className="flex-1 min-w-0 resize-none max-h-40 px-4 py-2.5 rounded-3xl bg-zinc-100 dark:bg-white/[0.06] border border-transparent focus:border-indigo-500/40 focus:outline-none text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500"
          />
          </div>

          {text.trim() || editing ? (
            <button onClick={submit} disabled={busy || !text.trim()} aria-label={editing ? 'Save' : 'Send'} className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 disabled:opacity-50 active:scale-95 transition-transform">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          ) : (
            <button onClick={startRecording} aria-busy={busy || undefined} disabled={busy} aria-label="Record voice message" className={cn('w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-50', 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:text-indigo-500')}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
        </div>
      )}

      <input ref={mediaRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f); }} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f); }} />
    </div>
  );
}
