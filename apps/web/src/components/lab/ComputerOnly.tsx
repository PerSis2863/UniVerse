'use client';

import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Copy, Laptop, Share2 } from 'lucide-react';
import Link from '@/components/ui/Link';
import { useDesktop } from '@/lib/use-desktop';

// Hyperion is for computers only (M405, the owner, 22 Nov: "no need to build hyperion on phone it should be available on
// computer only"). On a phone or tablet its pages say so, with the link to open on a computer; nothing of the engine
// is downloaded there.
export function ComputerOnly({ children, skeleton }: { children: ReactNode; skeleton: ReactNode }) {
  const desktop = useDesktop(null);
  if (desktop === null) return skeleton;
  if (desktop) return children;
  // Shown without a shared script's long part (#s=…, M398); copied and sent with it.
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`, full = typeof window === 'undefined' ? '' : window.location.href;
  const copy = async () => { try { await navigator.clipboard.writeText(full); toast.success('Link copied: open it on your computer.'); } catch { toast.error('Copying isn’t allowed here.'); } };
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <div className="panel mx-auto mt-6 max-w-md p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><Laptop className="h-6 w-6" aria-hidden /></span>
      <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">Hyperion is made for computers</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">Its code editor, simulations and figures need a big screen, a keyboard and a mouse. Open this page on your computer:</p>
      <p className="mt-3 break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-800 dark:bg-white/[0.06] dark:text-zinc-100" translate="no">{url}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => void copy()}><Copy className="h-3.5 w-3.5" aria-hidden />Copy the link</button>
        {canShare && <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1.5" onClick={() => { void navigator.share({ title: 'Hyperion', url: full }).catch(() => {}); }}><Share2 className="h-3.5 w-3.5" aria-hidden />Send it</button>}
      </div>
      <Link href="/hub" className="mt-4 inline-block text-sm font-medium text-violet-700 hover:underline dark:text-violet-300">See the other apps</Link>
    </div>
  );
}
