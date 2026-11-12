/**
 * Shares a link with the phone's share sheet when there is one, otherwise copies it (M155). Returns what
 * happened, so the caller can say "Copied". Cancelling the share sheet is not an error.
 */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title, url }); return 'shared'; }
    catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
}
