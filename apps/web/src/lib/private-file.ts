'use client';

import useSWR from 'swr';
import { authFetch } from './auth-token';
import { isUploadedFileUrl } from './file-urls';

// Private files open through a link that works for 10 minutes (POST /api/files/link; the rules are
// in src/server/private-files.ts): call recordings always, and a student's documents where the page
// says so. Everything else keeps its own address.

/** A call recording stored by the app (recordings/… in file storage). */
export function isRecordingUrl(url: string | null | undefined): boolean {
  if (!url || !isUploadedFileUrl(url)) return false;
  try {
    return new URL(url, 'https://x.invalid').pathname.startsWith('/recordings/');
  } catch {
    return false;
  }
}

/** A fresh 10-minute link to a private file (the address itself for other files). */
export async function privateFileUrl(url: string): Promise<string> {
  const r = await authFetch('/api/files/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const data = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !data.url) throw new Error(data.error || 'This file can’t be opened right now.');
  return data.url;
}

/** Opens a private file in a new tab (the tab opens at once, so the browser doesn't block it). */
export async function openPrivateFile(url: string, onError?: (message: string) => void) {
  const tab = window.open('', '_blank');
  try {
    const link = await privateFileUrl(url);
    if (tab) tab.location.href = link;
    else window.location.href = link;
  } catch (e) {
    tab?.close();
    onError?.((e as Error).message);
  }
}

/**
 * For a player's src: the 10-minute link for a private file (renewed every 9 minutes while shown),
 * null while it loads, and the address itself for other files.
 */
export function usePrivateFileUrl(url: string, isPrivate = isRecordingUrl(url)): string | null {
  const { data } = useSWR(isPrivate ? ['private-file', url] : null, () => privateFileUrl(url), { refreshInterval: 9 * 60_000, revalidateOnFocus: false, shouldRetryOnError: false });
  return isPrivate ? data ?? null : url;
}
