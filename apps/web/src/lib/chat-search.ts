// Message search 2.0 (Stage 4 · 1.14): the filters typed in the search box (src/app/api/chat/search).

type Has = 'file' | 'link' | 'photo' | 'voice';

/** from:name, in:chat, has:file|link|photo|voice, before:/after:YYYY-MM-DD, and the words. */
export function parseQuery(raw: string) {
  const out: { words: string[]; from?: string; in?: string; has?: Has; before?: Date; after?: Date } = { words: [] };
  for (const tok of raw.match(/(\w+:"[^"]*"|\S+)/g) ?? []) {
    const m = /^(from|in|has|before|after):(.+)$/i.exec(tok);
    const val = m?.[2].replace(/^"|"$/g, '').trim();
    if (!m || !val) { out.words.push(tok.replace(/^"|"$/g, '')); continue; }
    const key = m[1].toLowerCase();
    if (key === 'from') out.from = val.toLowerCase();
    else if (key === 'in') out.in = val.toLowerCase().replace(/^#/, '');
    else if (key === 'has') {
      const h = val.toLowerCase();
      out.has = h.startsWith('file') || h === 'doc' ? 'file' : h.startsWith('link') || h === 'url' ? 'link' : h.startsWith('photo') || h.startsWith('image') || h === 'img' ? 'photo' : h.startsWith('voice') || h === 'audio' ? 'voice' : undefined;
    } else {
      const d = new Date(`${val}T00:00:00`);
      if (Number.isFinite(d.getTime())) {
        if (key === 'before') out.before = d;
        else out.after = d; // from the start of that day
      }
    }
  }
  out.words = out.words.filter((w) => w.length >= 1).slice(0, 6);
  return out;
}
