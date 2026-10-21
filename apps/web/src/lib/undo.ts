'use client';

import { toast } from 'sonner';

// "Deleted · Undo" (Phase E, the pattern from the course board's useRemove): the thing goes from the
// screen at once and is deleted for real only when the message goes away (5 seconds, or closed);
// Undo brings it back and nothing is sent. Leaving the app inside those seconds keeps it.

export function removeWithUndo(label: string, { hide, restore, commit }: {
  /** Take it off the screen now. */
  hide: () => void;
  /** Undo: put it back as it was. */
  restore: () => void;
  /** The real delete; if it fails the message says so and `restore` runs. */
  commit: () => Promise<unknown>;
}) {
  let settled = false;
  hide();
  const run = async () => {
    if (settled) return;
    settled = true;
    try { await commit(); } catch (e) { toast.error((e as Error).message || 'Couldn’t delete it.'); restore(); }
  };
  toast(label, {
    duration: 5000,
    action: { label: 'Undo', onClick: () => { settled = true; restore(); } },
    onAutoClose: () => void run(),
    onDismiss: () => void run(),
  });
}
