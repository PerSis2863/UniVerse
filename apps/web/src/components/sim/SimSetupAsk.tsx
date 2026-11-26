'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { Model } from '@/lib/sim/model';

// Hyperion Simulate → Structures → "Describe it" (M549b): a few words become a study (Ghidra's sim-setup skill): the
// shape, its sizes, the material, where it is held, the loads and the analysis. The bench opens it as if typed in.

export type SetupAnalysis = 'static' | 'modal' | 'buckling' | 'topology';
export function SimSetupAsk({ onStudy }: { onStudy: (m: Model, a: SetupAnalysis) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy || text.trim().length < 8) return;
    setBusy(true);
    try {
      const r = await api.post<{ model: Model; analysis: SetupAnalysis; note: string }>('/hyperion/setup', { text });
      onStudy(r.data.model, r.data.analysis);
      toast.success(r.data.note || 'Ghidra set the study up.');
      setText('');
    } catch (e) { toast.error(errorMessage(e, 'Ghidra couldn’t set it up just now.')); } finally { setBusy(false); }
  };
  return (
    <form className="mb-2 space-y-1.5" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <label htmlFor="sim-setup" className="flex items-center gap-1.5 px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400"><Sparkles className="h-3.5 w-3.5" aria-hidden />Describe it: Ghidra sets it up</label>
      <textarea id="sim-setup" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className="input w-full resize-none text-[13px]"
        placeholder="An aluminium L-bracket bolted at the top, 2 kN down on the end hole. Will it hold?" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void go(); } }} />
      <button type="submit" className="btn-primary w-full text-[13px]" disabled={busy || text.trim().length < 8}>{busy ? 'Setting it up…' : 'Set it up'}</button>
    </form>
  );
}
