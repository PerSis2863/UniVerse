'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Globe } from 'lucide-react';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { useLanguageStore } from '@/store/language';
import { cn } from '@/lib/utils';

// The language, one tap from the top bar (Phase E); the same choice as Settings → Language & data.
// The button itself shows no language-dependent text, so the server's drawing and the browser's
// (which knows the saved language) always match.

/** `row`: a full-width row with the word "Language" (the side menu), opening upwards. */
export function LanguageMenu({ className, row }: { className?: string; row?: boolean }) {
  const { language, setLanguage } = useLanguageStore();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); };
  }, [open]);

  const pick = (code: Language) => {
    setOpen(false);
    if (code === language) return;
    setLanguage(code);
    toast.success(`Language changed to ${LANGUAGES.find((l) => l.code === code)?.nativeName}`);
  };

  return (
    <div ref={box} className={cn('relative', className)}>
      {row ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[15px] text-zinc-800 dark:text-zinc-100 hover:bg-[var(--fill)] transition-colors">
          <Globe className="w-[18px] h-[18px]" /><span>Language</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Language"
          className={cn('btn-ghost btn-icon rounded-full', open && 'bg-[var(--fill)]')}>
          <Globe className="w-[18px] h-[18px]" /><span className="sr-only">Language</span>
        </button>
      )}
      {open && (
        <div role="menu" aria-label="Language" className={cn('absolute z-[140] w-56', row ? 'start-0 bottom-11' : 'end-0 top-11', ' max-h-[60vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl p-1 fade-up')}>
          {LANGUAGES.map((l) => (
            <button key={l.code} type="button" role="menuitemradio" aria-checked={language === l.code} onClick={() => pick(l.code)}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-start text-sm', language === l.code ? 'bg-indigo-500/10 text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-200 hover:bg-[var(--fill)]')}>
              <span aria-hidden className="text-lg leading-none">{l.flag}</span>
              <span className="flex-1 min-w-0"><span className="block font-medium" lang={l.code} translate="no">{l.nativeName}</span><span className="block text-xs text-zinc-600 dark:text-zinc-400">{l.name}</span></span>
              {language === l.code && <Check className="w-4 h-4 text-tint-text" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
