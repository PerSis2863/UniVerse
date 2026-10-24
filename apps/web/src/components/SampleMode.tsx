'use client';

import { mutate } from 'swr';
import { toast } from 'sonner';
import { FlaskConical, X } from 'lucide-react';
import { clearVisitorStorage, enterSampleMode, exitSampleMode, isSampleVisitor, setVisitor, useSampleMode } from '@/lib/sample-mode';
import { haptic } from '@/lib/haptics';

/**
 * Reload every page's data from the new source (sample or real). Call after switching: a
 * revalidating mutate also drops SWR's 5-second de-duplication, so a page opened moments before
 * can't be handed its old answer again (it kept showing the real, empty page until a refresh).
 * The page itself is re-opened by DashboardShell (keyed on sample mode).
 */
async function reloadData() {
  await mutate(() => true, undefined, { revalidate: true });
}

export async function startSampleMode() {
  enterSampleMode();
  await reloadData();
  haptic('success');
  toast.success('Sample mode is on', { description: 'Explore every page with example data. Nothing you do is saved.' });
}

/**
 * "Try the live demo" for someone without an account: a made-up person in this tab only (the auth
 * store keeps it in sessionStorage while the visitor flag is on), every page answered from example
 * data, then a fresh load of the chosen app.
 */
export function startVisitorDemo(home = '/hub') {
  const now = new Date().toISOString();
  const user = { id: 'sample-visitor', name: 'Alex Demo', email: 'alex@demo.universe', role: 'STUDENT', status: 'ACTIVE', createdAt: now, onboardedAt: now };
  try {
    sessionStorage.setItem('universe-auth', JSON.stringify({ state: { user }, version: 0 }));
    sessionStorage.setItem('uv-app', home.startsWith('/trace') ? 'trace' : home.startsWith('/relief') ? 'relief' : home.startsWith('/green') ? 'green' : 'campus');
  } catch { /* private mode: the demo can't keep its person, so it doesn't start */ return; }
  setVisitor(true);
  enterSampleMode();
  window.location.href = home; // a full load, so the auth store opens this tab's made-up person
}

export async function stopSampleMode() {
  if (isSampleVisitor()) {
    clearVisitorStorage();
    window.location.href = '/';
    return;
  }
  const { resetSampleDb } = await import('@/lib/sample/router');
  resetSampleDb();
  exitSampleMode();
  await reloadData();
  toast('Back to your real account');
}

/** Slim banner shown on every page while sample mode is on. */
export function SampleModeBar() {
  const on = useSampleMode();
  if (!on) return null;
  const visitor = isSampleVisitor();
  return (
    <div role="status" className="relative z-30 flex items-center gap-3 px-4 py-2 text-xs sm:text-sm bg-gradient-to-r from-fuchsia-400 to-fuchsia-600 text-amber-950 shadow-sm">
      <FlaskConical className="w-4 h-4 shrink-0" />
      {visitor ? (
        <p className="flex-1 min-w-0 truncate"><strong>Live demo</strong><span className="hidden sm:inline"> — everything here is example data, and nothing you do is saved.</span></p>
      ) : (
        <p className="flex-1 min-w-0 truncate"><strong>Sample mode</strong><span className="hidden sm:inline"> — you&apos;re exploring with example data. Nothing you do is saved or sent.</span></p>
      )}
      {visitor && (
        <a href="/register" onClick={clearVisitorStorage} className="shrink-0 px-3 py-1 rounded-full bg-amber-950 text-fuchsia-100 font-semibold hover:bg-amber-900">Create a free account</a>
      )}
      <button onClick={stopSampleMode} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-950/10 hover:bg-amber-950/20 font-semibold">
        <X className="w-3.5 h-3.5" /> Exit
      </button>
    </div>
  );
}
