// Text for search everywhere (Stage 5 · Q10, src/server/search-index.ts): pure, so it's tested.

/** The words of some HTML (tags and entities out), for the index. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|td|th|br|blockquote|pre)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

/** Words for FTS5: each must appear (as a word or the start of one); quotes and operators can't get in. */
export function ftsQuery(q: string): string | null {
  const words = q.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  const usable = words.filter((w) => w.length >= 2);
  return usable.length ? usable.map((w) => `"${w}"*`).join(' AND ') : null;
}

