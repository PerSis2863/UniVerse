'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { m as motion } from 'framer-motion';
import { Fingerprint, Loader2, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { lockSupported, setChatLocked, useChatLock, verifyMe } from '@/lib/chat-lock';
import { spring } from '@/lib/motion';

// Chat lock (Stage 4 · 1.10, src/lib/chat-lock.ts): the screen over a locked chat, and the switch
// in the chat's info panel.

/** Is this chat hidden right now? */
export function useChatLocked(chatId: string) {
  return useChatLock((s) => s.chats.includes(chatId) && !s.unlocked);
}

export function LockedChat({ title }: { title: string }) {
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    try {
      if (await verifyMe()) useChatLock.getState().setUnlocked(true);
      else toast.error('Couldn’t check it’s you. Try again.');
    } catch { toast.error('Couldn’t check it’s you. Try again.'); } finally { setBusy(false); }
  };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring.smooth} className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center shadow-xl shadow-fuchsia-500/20"><Lock className="w-7 h-7" /></span>
      <div>
        <p className="font-semibold text-zinc-900 dark:text-white">{title} is locked</p>
        <p className="text-sm text-zinc-500 mt-1 max-w-xs">Use Face ID, your fingerprint or your device PIN to open your locked chats on this device.</p>
      </div>
      <button type="button" onClick={() => void unlock()} disabled={busy} className="btn-primary">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}Unlock</button>
    </motion.div>
  );
}

/** The "Lock this chat" switch (chat info panel). Hidden where the device can't check it's you. */
export function LockSwitch({ chatId }: { chatId: string }) {
  const locked = useChatLock((s) => s.chats.includes(chatId));
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void lockSupported().then(setOk); }, []);
  if (!ok) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2"><Lock className="w-4 h-4 text-zinc-500" /> Lock this chat
        <span className="text-[11px] text-zinc-500">(this device)</span></span>
      <Switch checked={locked} disabled={busy} label="Lock this chat" onChange={(on) => void (async () => {
        setBusy(true);
        try {
          if (await setChatLocked(chatId, on)) toast.success(on ? 'Locked. It opens with Face ID, fingerprint or PIN on this device.' : 'Chat unlocked');
        } catch { toast.error('Couldn’t check it’s you, so nothing changed.'); } finally { setBusy(false); }
      })()} />
    </div>
  );
}
