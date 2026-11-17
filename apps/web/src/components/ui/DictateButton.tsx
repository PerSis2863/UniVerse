'use client';

import { useState, useSyncExternalStore } from 'react';
import { Mic } from 'lucide-react';
import { toast } from 'sonner';
import { captionsSupported, useCaptions } from '@/lib/use-captions';
import { spoken } from '@/lib/dictation';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

// M229: voice typing. Press, speak, press again: each finished phrase is handed to `onText` (spoken punctuation turned
// into marks, src/lib/dictation.ts) and the field adds it where its own rules say (joinDictation). The browser's own
// speech recognition (Chrome and Edge use their speech service, Safari the device): nothing else is sent anywhere.
// Hidden where the browser can't (Firefox).

const noop = () => () => {};

export function DictateButton({ onText, className, label = 'Voice typing' }: { onText: (text: string) => void; className?: string; label?: string }) {
  const can = useSyncExternalStore(noop, captionsSupported, () => false);
  const [on, setOn] = useState(false);
  useCaptions(on, (text, final) => { if (final) onText(spoken(text, navigator.language)); }, () => {
    setOn(false);
    toast.error('Voice typing needs permission to use the microphone and speech recognition in this browser.');
  });
  if (!can) return null;
  return (
    <button type="button" aria-pressed={on} onClick={() => { haptic('tap'); setOn((v) => !v); }} title={on ? 'Stop voice typing' : `${label}: speak and it types`}
      className={cn('relative grid place-items-center w-9 h-9 rounded-full shrink-0 transition-[background-color,color,transform] duration-150 active:scale-90', on ? 'bg-rose-600 text-white' : 'text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]', className)}>
      {on && <span aria-hidden className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping" />}
      <Mic className="relative w-[18px] h-[18px]" aria-hidden />
      <span className="sr-only">{on ? 'Stop voice typing' : label}</span>
    </button>
  );
}
