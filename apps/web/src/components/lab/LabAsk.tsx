'use client';

import { useState } from 'react';
import { Copy, FilePlus2, Loader2, Replace, Sparkles, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { MathText } from '@/components/ui/MathText';
import { authFetch } from '@/lib/auth-token';
import { codeOf } from '@/lib/hyperion-ai';

// Hyperion's AI (M435): ask in plain words for code, an explanation of this script, or a fix for its error. The answer's
// code goes into a new script or replaces this one only when the person chooses, and runs only when they press Run.

interface Props { code: string; error: { line: number; message: string } | null; onNew: (code: string) => void; onReplace: (code: string) => void }

export function LabAsk({ code, error, onNew, onReplace }: Props) {
  const [question, setQuestion] = useState('');
  const [withScript, setWithScript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const ask = async (fix: boolean) => {
    if (busy || (!fix && !question.trim())) return;
    setBusy(true); setAnswer(null);
    try {
      const res = await authFetch('/api/hyperion/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fix && error ? { question, code, error: `line ${error.line}: ${error.message}` } : { question, code: withScript ? code : undefined }),
      });
      const j = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !j.answer) toast.error(j.error ?? 'Ghidra can’t answer right now.');
      else setAnswer(j.answer);
    } catch { toast.error('Ghidra can’t be reached. Check the connection.'); }
    setBusy(false);
  };

  const got = answer ? codeOf(answer) : null;
  const words = answer ? answer.replace(/```[\s\S]*?```/g, '').trim() : '';
  return (
    <div role="group" aria-label="Ask Ghidra" className="space-y-2 border-b border-zinc-200/80 px-3 py-3 dark:border-white/10" data-no-motion>
      <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); void ask(false); }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={6000} aria-label="Your question for Ghidra"
          placeholder="e.g. Plot a damped sine wave and find where it first drops below 0.1"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(false); } }}
          className="input min-h-[2.75rem] min-w-[14rem] flex-1 resize-y text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary btn-sm inline-flex items-center gap-1.5" disabled={busy || !question.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}Ask
          </button>
          {error && <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" disabled={busy} onClick={() => void ask(true)}><Wrench className="h-3.5 w-3.5" aria-hidden />Fix the error</button>}
        </div>
        <label className="flex w-full items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" checked={withScript} onChange={(e) => setWithScript(e.target.checked)} />Ask about this script (it is sent with the question)
        </label>
      </form>
      {answer && (
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          {words && <div className="whitespace-pre-wrap leading-relaxed text-zinc-800 dark:text-zinc-100"><MathText text={words} /></div>}
          {got && <pre translate="no" tabIndex={0} aria-label="The AI’s code" className="max-h-72 overflow-auto rounded-lg bg-zinc-50 p-2.5 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-black/30 dark:text-zinc-100">{got}</pre>}
          {got && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => onNew(got)}><FilePlus2 className="h-3.5 w-3.5" aria-hidden />Put in a new script</button>
              <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => { if (!code.trim() || confirm('Replace this script with the AI’s code?')) onReplace(got); }}><Replace className="h-3.5 w-3.5" aria-hidden />Replace this script</button>
              <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => void navigator.clipboard.writeText(got).then(() => toast.success('Copied.'))}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</button>
            </div>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">AI can be wrong: check the results. Press Run to try the code.</p>
        </div>
      )}
    </div>
  );
}
