'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { SELECT_HELP_EVENT, selectHelp } from '@/lib/display-prefs';

// Help with selected text (Stage 5 · D9, reading levels on any page): when it's on (Settings →
// Appearance), selecting text anywhere in the app shows a small bar to listen to it or read it in
// simpler words. The bar itself loads only for people who turned it on.

const SelectionHelper = dynamic(() => import('./SelectionHelper'), { ssr: false });

const subscribe = (on: () => void) => {
  window.addEventListener(SELECT_HELP_EVENT, on);
  window.addEventListener('storage', on);
  return () => { window.removeEventListener(SELECT_HELP_EVENT, on); window.removeEventListener('storage', on); };
};

export function SelectionHelp() {
  const on = useSyncExternalStore(subscribe, selectHelp, () => false);
  return on ? <SelectionHelper /> : null;
}
