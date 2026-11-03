'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { BellOff, CalendarClock, Loader2, Undo2, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { EFFECTS, type MessageEffect } from '@/lib/message-effects';

// The message box's extras from other apps (M17): "Send with…" (iMessage's effects, Telegram's
// silent send, Gmail's undo send), Magic Compose (Google Messages: your draft in another tone) and
// a quick reaction per chat (Messenger's one-tap emoji).

export interface SendChoice { effect: MessageEffect | null; silent: boolean }

const UNDO_KEY = 'uv-undo-send';
export const undoSendOn = () => { try { return localStorage.getItem(UNDO_KEY) === '1'; } catch { return false; } };

/** A message waits this long before it goes, with Undo (Gmail's undo send), when that's switched on. */
export function undoWindow(preview: string, ms = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (go: boolean) => { if (!settled) { settled = true; resolve(go); } };
    const id = toast(`Sending “${preview.slice(0, 40)}${preview.length > 40 ? '…' : ''}”`, {
      duration: ms,
      action: { label: 'Undo', onClick: () => { finish(false); toast.success('Not sent'); } },
      onAutoClose: () => finish(true),
      onDismiss: () => finish(true),
      className: 'undo-send-toast',
    });
    setTimeout(() => { finish(true); toast.dismiss(id); }, ms + 200);
  });
}

/** "Send with…": an effect, silently, or later. */
export function SendWithMenu({ choice, onChange, onSend, onSchedule, onClose }: {
  choice: SendChoice; onChange: (c: SendChoice) => void; onSend: () => void; onSchedule?: () => void; onClose: () => void;
}) {
  const [undo, setUndo] = useState(undoSendOn);
  const toggleUndo = () => { const v = !undo; setUndo(v); try { localStorage.setItem(UNDO_KEY, v ? '1' : '0'); } catch { /* private mode */ } };
  return (
    <div role="dialog" aria-label="Send with" className="menu-pop absolute bottom-full mb-2 end-0 z-40 w-[19rem] max-w-[calc(100vw-1.5rem)] p-3 rounded-3xl bg-white/95 dark:bg-[#1d2650]/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-fuchsia-950/30" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-zinc-900 dark:text-white">Send with an effect</p>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Effect">
        {EFFECTS.map((e) => (
          <button key={e.id} type="button" role="radio" aria-checked={choice.effect === e.id} onClick={() => { haptic('tap'); onChange({ ...choice, effect: choice.effect === e.id ? null : e.id }); }}
            className={cn('fx-chip flex flex-col items-center gap-0.5 py-2 rounded-2xl text-xs font-semibold transition-[transform,background-color] duration-150 active:scale-95', choice.effect === e.id ? 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/30' : 'bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/10')}>
            <span className="text-xl leading-none" aria-hidden>{e.emoji}</span>{e.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{choice.effect ? (EFFECTS.find((e) => e.id === choice.effect)?.screen ? 'Plays across the chat when it arrives.' : 'Changes how the message lands.') : 'Like iMessage: pick one, then send.'}</p>
      <div className="mt-2 space-y-1">
        <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] cursor-pointer text-sm text-zinc-800 dark:text-zinc-100">
          <BellOff className="w-4 h-4 text-indigo-500" /><span className="flex-1">Send silently<span className="block text-xs text-zinc-500">Arrives without a notification</span></span>
          <input type="checkbox" checked={choice.silent} onChange={(e) => onChange({ ...choice, silent: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
        </label>
        <label className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] cursor-pointer text-sm text-zinc-800 dark:text-zinc-100">
          <Undo2 className="w-4 h-4 text-indigo-500" /><span className="flex-1">Undo send<span className="block text-xs text-zinc-500">Messages wait 4 seconds so you can take them back</span></span>
          <input type="checkbox" checked={undo} onChange={toggleUndo} className="w-4 h-4 accent-indigo-600" />
        </label>
        {onSchedule && (
          <button type="button" onClick={onSchedule} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.05] text-sm text-zinc-800 dark:text-zinc-100 text-start">
            <CalendarClock className="w-4 h-4 text-indigo-500" /> Send later…
          </button>
        )}
      </div>
      <button type="button" onClick={onSend} className="btn-primary w-full justify-center mt-2">Send{choice.effect ? ` with ${EFFECTS.find((e) => e.id === choice.effect)?.label.toLowerCase()}` : ''}{choice.silent ? ', silently' : ''}</button>
    </div>
  );
}

const TONES: [string, string][] = [['friendly', '😊 Friendlier'], ['formal', '🎩 More formal'], ['shorter', '✂️ Shorter'], ['clear', '💡 Clearer'], ['excited', '🎉 Excited'], ['fix', '✅ Fix spelling']];

/** Magic Compose: the draft rewritten in another tone, with one tap back to the original. */
export function RewriteMenu({ text, onRewrite, onApply, onClose }: { text: string; onRewrite: (text: string, tone: string) => Promise<string>; onApply: (t: string) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (tone: string) => {
    setBusy(tone);
    try { onApply(await onRewrite(text, tone)); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <div role="dialog" aria-label="Rewrite" className="menu-pop absolute bottom-full mb-2 start-0 z-40 w-72 max-w-[calc(100vw-1.5rem)] p-3 rounded-3xl bg-white/95 dark:bg-[#1d2650]/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-2xl shadow-indigo-950/30" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <p className="text-sm font-bold text-zinc-900 dark:text-white inline-flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-fuchsia-500" /> Rewrite my message</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 mb-2">AI rewrites it; nothing is sent until you press Send.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {TONES.map(([id, label]) => (
          <button key={id} type="button" disabled={!!busy} onClick={() => void run(id)} className="px-2.5 py-2 rounded-xl text-sm font-semibold text-start bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-60 inline-flex items-center gap-1.5">
            {busy === id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const QUICK_EMOJI = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '😮', '🙏'];
const quickKey = (chat: string) => `uv-quick:${chat}`;
export const quickFor = (chat?: string) => { try { return (chat && localStorage.getItem(quickKey(chat))) || '👍'; } catch { return '👍'; } };

/** Messenger's one-tap reaction: this chat's own emoji, sent big. Hold or right-click to change it. */
export function QuickReaction({ chat, onSend, disabled }: { chat?: string; onSend: (emoji: string) => void; disabled?: boolean }) {
  const [emoji, setEmoji] = useState(() => quickFor(chat));
  const [picking, setPicking] = useState(false);
  const [pop, setPop] = useState(0);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const choose = (e: string) => { setEmoji(e); setPicking(false); try { if (chat) localStorage.setItem(quickKey(chat), e); } catch { /* private mode */ } };
  return (
    <div className="relative shrink-0">
      <button type="button" disabled={disabled} aria-label={`Send ${emoji}`} title="Tap to send · hold to change"
        onClick={() => { haptic('tap'); setPop((n) => n + 1); onSend(emoji); }}
        onPointerDown={() => { hold.current = setTimeout(() => { haptic('tap'); setPicking(true); }, 450); }}
        onPointerUp={() => clearTimeout(hold.current)} onPointerLeave={() => clearTimeout(hold.current)}
        onContextMenu={(e) => { e.preventDefault(); setPicking(true); }}
        className="w-11 h-11 rounded-full flex items-center justify-center text-2xl bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-50">
        <span key={pop} className={cn(pop > 0 && 'quick-pop')} aria-hidden>{emoji}</span>
      </button>
      {picking && (
        <div role="radiogroup" aria-label="This chat's quick reaction" className="menu-pop absolute bottom-full mb-2 end-0 z-40 flex gap-1 p-1.5 rounded-full bg-white dark:bg-[#1d2650] border border-zinc-200 dark:border-white/10 shadow-2xl">
          {QUICK_EMOJI.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={emoji === e} onClick={() => choose(e)} className={cn('w-9 h-9 rounded-full text-xl transition-transform hover:scale-125', emoji === e && 'bg-indigo-500/15')}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
