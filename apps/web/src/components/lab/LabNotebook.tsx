'use client';

import { BookOpen, Download, FileCode2, Loader2, Play } from 'lucide-react';
import { reportHtml, reportTex, textHtml, type Section } from '@/lib/lab/notebook';
import { scriptToIpynb } from '@/lib/lab/ipynb';
import { LabText, mathml, useKatex } from './LabText';
import type { FigOut } from './lab.worker';

// Hyperion's notebook view (M397): the open script as a page. Each `%%` section shows its text (with typeset maths),
// its code, and what it printed and drew the last time it ran; run one section or all of them, then download the
// page as a report (HTML to open or print, or LaTeX). Writing stays in the Code view.

export interface NoteOut { text: string; error?: string; figs: FigOut[] }

const btn = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-white/[0.08]';

export function LabNotebook({ name, sections, outs, running, waiting, busy, dark, onRun, onRunAll, onDownload }: {
  name: string; sections: Section[]; outs: (NoteOut | undefined)[]; running: number | null; waiting: number[]; busy: boolean; dark: boolean;
  onRun: (i: number) => void; onRunAll: () => void; onDownload: (file: string, body: string, type: string) => void;
}) {
  const needMath = sections.some((s) => s.blocks.some((b) => b.kind === 'text' && b.text.includes('$'))) || outs.some((o) => o?.text.includes('\u0001'));
  const katex = useKatex(needMath);
  const math = (tex: string, display: boolean) => mathml(katex, tex, display);
  const titled = sections.some((s) => s.title);
  const base = name.replace(/\.m$/, '');
  const report = async (kind: 'html' | 'tex') => {
    if (kind === 'html') {
      // Make sure the maths is set (not left as LaTeX) before writing the page.
      const k = katex ?? (await import('katex/dist/katex.mjs')).default;
      onDownload(`${base}.html`, reportHtml(name, sections, outs, (t, d) => mathml(k, t, d), new Date().toLocaleString()), 'text/html');
    } else onDownload(`${base}.tex`, reportTex(name, sections, outs), 'text/x-tex');
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3" data-no-motion>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={busy && running === null} onClick={onRunAll}><Play className="h-3.5 w-3.5" aria-hidden />Run all</button>
        <button type="button" className={btn} onClick={() => void report('html')} title="A page with the text, code, output and figures, to open, share or print as a PDF"><Download className="h-3.5 w-3.5" aria-hidden />Report</button>
        <button type="button" className={btn} onClick={() => void report('tex')} title="The same report as a LaTeX document"><FileCode2 className="h-3.5 w-3.5" aria-hidden />LaTeX report</button>
        <button type="button" className={btn} onClick={() => onDownload(`${base}.ipynb`, scriptToIpynb(sections, outs), 'application/x-ipynb+json')} title="A Jupyter notebook: each part a cell, with its output and figures"><BookOpen className="h-3.5 w-3.5" aria-hidden />Jupyter notebook</button>
      </div>
      {!titled && (
        <p className="mt-3 rounded-lg bg-zinc-100/80 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-200">
          Make this script a page: start each part with <code className="font-mono">%% A title</code>, and write <code className="font-mono">%</code> lines under it as text (<code className="font-mono">**bold**</code>, <code className="font-mono">$x^2$</code> for maths). Each part then runs on its own, with its results under it.
        </p>
      )}
      {sections.map((s, i) => {
        const o = outs[i], state = running === i ? 'Running' : waiting.includes(i) ? 'Waiting' : null;
        const title = s.title || (i === 0 ? name : `Part ${i + 1}`);
        return (
          <article key={`${i}-${s.line}`} aria-label={title} className="border-zinc-200/80 py-4 dark:border-white/10 [&:not(:first-of-type)]:border-t">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-900 dark:text-white" translate="no">{title}</h3>
              {state && <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">{state === 'Running' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{state}</span>}
              <button type="button" className={btn} disabled={!!state} onClick={() => onRun(i)} aria-label={`Run ${title}`}><Play className="h-3.5 w-3.5" aria-hidden /><span aria-hidden>Run</span></button>
            </div>
            {s.blocks.map((b, k) => (b.kind === 'text'
              ? <div key={k} translate="no" className="mt-2 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100 [&_.nb-display]:my-2 [&_.nb-display]:overflow-x-auto [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-white/10 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:ps-5" dangerouslySetInnerHTML={{ __html: textHtml(b.text, math) }} />
              : <pre key={k} translate="no" tabIndex={0} aria-label={`Code of ${title}`} className="mt-2 overflow-x-auto rounded-lg bg-zinc-100/90 px-3 py-2 font-mono text-[13px] leading-relaxed text-zinc-900 dark:bg-white/[0.06] dark:text-zinc-100"><code>{b.code}</code></pre>))}
            {o?.text.trim() && <pre tabIndex={0} aria-label={`What ${title} printed`} className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200/80 px-3 py-2 font-mono text-[13px] leading-relaxed text-zinc-900 dark:border-white/10 dark:text-zinc-100"><LabText text={o.text.replace(/\n{3,}/g, '\n\n').trim()} /></pre>}
            {o?.error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 font-mono text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-300">Error: {o.error}</p>}
            {o?.figs.map((f) => (
              // Our own SVG (labels escaped by the renderer), drawn for this theme.
              <div key={f.id} role="img" aria-label={`Figure ${f.id} of ${title}`} className="mt-2 w-full max-w-[640px] overflow-hidden rounded-lg border border-zinc-200/80 dark:border-white/10 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: dark ? f.dark : f.light }} />
            ))}
          </article>
        );
      })}
    </div>
  );
}
