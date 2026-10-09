// Opens a self-printing HTML page (transcripts, report cards) in a new tab. Returns false when the
// browser blocked the tab, so the caller can say to allow pop-ups.
export function openPrintable(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!w;
}
