'use client';

import { mutate } from 'swr';
import { toast } from 'sonner';
import { FlaskConical, X } from 'lucide-react';
import { enterSampleMode, exitSampleMode, useSampleMode } from '@/lib/sample-mode';
import { haptic } from '@/lib/haptics';

/** Clear cached data so every page re-reads from the new source (sample or real). */
async function clearCache() {
  await mutate(() => true, undefined, { revalidate: false });
}

export async function startSampleMode() {
  await clearCache();
  enterSampleMode();
  haptic('success');
  toast.success('Sample mode is on', { description: 'Explore every page with example data. Nothing you do is saved.' });
}

export async function stopSampleMode() {
  await clearCache();
  const { resetSampleDb } = await import('@/lib/sample/router');
  resetSampleDb();
  exitSampleMode();
  toast('Back to your real account');
}

/** Slim banner shown on every page while sample mode is on. */
export function SampleModeBar() {
  const on = useSampleMode();
  if (!on) return null;
  return (
    <div role="status" className="relative z-30 flex items-center gap-3 px-4 py-2 text-xs sm:text-sm bg-gradient-to-r from-amber-400 to-orange-400 text-amber-950 shadow-sm">
      <FlaskConical className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0 truncate"><strong>Sample mode</strong><span className="hidden sm:inline"> — you&apos;re exploring with example data. Nothing you do is saved or sent.</span></p>
      <button onClick={stopSampleMode} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-950/10 hover:bg-amber-950/20 font-semibold">
        <X className="w-3.5 h-3.5" /> Exit
      </button>
    </div>
  );
}
