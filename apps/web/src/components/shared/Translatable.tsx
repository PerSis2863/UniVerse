'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Languages, Loader2 } from 'lucide-react';
import { authedJson } from '@/lib/authed-fetch';
import { isLanguage, languageName } from '@/lib/languages';
import { useLanguageStore } from '@/store/language';
import { cn } from '@/lib/utils';
import { GlossedText, ReadingLevelControl, useReadingLevel } from './ReadingLevel';

// "Translate" on texts that aren't chat messages (Stage 5 · B7.5; src/server/text-translate.ts):
// announcements, group posts, and comments on tasks, docs and whiteboards; assignment instructions,
// answers and feedback, and course materials (D8). Into the app's language;
// translated once per text and language for everyone, and kept on this page once fetched.

export type TextKind = 'announcement' | 'group-post' | 'task-comment' | 'doc-comment' | 'board-comment' | 'assignment' | 'submission' | 'feedback' | 'material-part';
interface Result { text: string; from: string; same: boolean }
const cache = new Map<string, Result>();
/** Whether a text has words to translate (not only emoji, numbers, links or punctuation), as the server decides. */
const hasWords = (text: string) => text.replace(/https?:\/\/\S+/g, '').replace(/[@#]\S+/g, '').replace(/[\p{P}\p{S}\p{N}\s]/gu, '').length >= 2;

export function useTextTranslation(kind: TextKind, id: string) {
  const app = useLanguageStore((s) => s.language);
  const to = isLanguage(app) ? app : 'en';
  const key = `${kind}:${id}:${to}`;
  const [result, setResult] = useState<Result | null>(() => cache.get(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState(false);
  const translate = async () => {
    if (result) { setOriginal(false); return; }
    setLoading(true);
    try {
      const r = await authedJson<{ translations: Record<string, Result> }>('/api/translate', { method: 'POST', body: JSON.stringify({ items: [{ kind, id }], to }) });
      const got = r.translations[`${kind}:${id}`];
      if (!got) throw new Error('Couldn’t translate this.');
      cache.set(key, got);
      setResult(got);
      if (got.same) toast(`It’s already in ${languageName(to)}.`);
    } catch (e) { toast.error((e as Error).message || 'Couldn’t translate this.'); }
    finally { setLoading(false); }
  };
  const showing = result && !result.same && !original ? result.text : null;
  return { showing, result, loading, translate, original, setOriginal, to };
}

/** The small control under a text: Translate · Translating… · Translated from French · Show original. */
export function TranslateControl({ t, className }: { t: ReturnType<typeof useTextTranslation>; className?: string }) {
  if (t.result?.same) return null;
  const from = t.result && isLanguage(t.result.from) ? languageName(t.result.from) : null;
  return (
    <p className={cn('mt-1 text-[11px] text-zinc-500 flex items-center gap-1', className)}>
      <Languages className="w-3 h-3 shrink-0" aria-hidden />
      {t.loading ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden />Translating…</span>
        : t.showing ? <>{from ? `Translated from ${from} · ` : 'Translated · '}<button type="button" onClick={() => t.setOriginal(true)} className="font-semibold text-indigo-600 dark:text-indigo-400">Show original</button></>
        : <button type="button" onClick={() => void t.translate()} className="font-semibold text-indigo-600 dark:text-indigo-400">{t.result ? 'Show translation' : 'Translate'}</button>}
    </p>
  );
}

/**
 * A text (or its translation) with the control under it. `render` draws the text when it needs more
 * than a paragraph. `levels`: assignment instructions can also be read at a simpler level and aloud (D9).
 */
export function Translatable({ kind, id, text, className, controlClassName, render, hide, levels }: {
  kind: TextKind; id: string; text: string; className?: string; controlClassName?: string; render?: (text: string) => React.ReactNode; hide?: boolean; levels?: boolean;
}) {
  const t = useTextTranslation(kind, id);
  const lv = useReadingLevel(levels && (kind === 'assignment' || kind === 'material-part') ? kind : null, id, t.showing ? t.to : '');
  const shown = lv.leveled?.text ?? t.showing ?? text;
  const lang = t.showing ? t.to : undefined;
  const words = !hide && hasWords(text);
  return (
    <>
      {render ? render(shown) : lv.leveled ? <GlossedText text={lv.leveled.text} terms={lv.leveled.terms} lang={lang} className={className} /> : <p className={className} lang={lang}>{shown}</p>}
      {words && <TranslateControl t={t} className={controlClassName} />}
      {words && levels && <ReadingLevelControl r={lv} speakText={shown} lang={lang} className={controlClassName} />}
    </>
  );
}

/** An announcement's title and body, translated together. */
export function TranslatableAnnouncement({ id, title, body, titleAs: Title = 'h3', titleClassName, bodyClassName, controlClassName, aside }: {
  id: string; title: string; body: string; titleAs?: 'h2' | 'h3' | 'h4'; titleClassName?: string; bodyClassName?: string; controlClassName?: string;
  /** Next to the title (e.g. the date and a delete button). */ aside?: React.ReactNode;
}) {
  const t = useTextTranslation('announcement', id);
  // The server translates "title\n\nbody" as one text.
  const at = t.showing ? t.showing.indexOf('\n\n') : -1;
  const [ttl, bdy] = t.showing ? (at >= 0 ? [t.showing.slice(0, at), t.showing.slice(at + 2)] : [title, t.showing]) : [title, body];
  return (
    <>
      {aside ? <div className="flex items-start justify-between gap-3"><Title className={titleClassName} lang={t.showing ? t.to : undefined}>{ttl}</Title>{aside}</div> : <Title className={titleClassName} lang={t.showing ? t.to : undefined}>{ttl}</Title>}
      <p className={bodyClassName} lang={t.showing ? t.to : undefined}>{bdy}</p>
      {hasWords(`${title} ${body}`) && <TranslateControl t={t} className={controlClassName} />}
    </>
  );
}
