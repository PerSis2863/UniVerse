// M229 (the owner, 16 Nov, after OpenWhispr: "add this in the project"): voice typing. The browser turns speech into
// text (the same Web Speech API as live captions, src/lib/use-captions.ts: free, nothing sent to a paid service); these
// rules make what it hears read like typing: spoken punctuation in English ("comma", "full stop", "new line"…), and
// each finished phrase joined to the text before it with the right space and capital.

const MARKS: [RegExp, string][] = [
  [/\s*\bnew paragraph\b\s*/gi, '\n\n'],
  [/\s*\bnew line\b\s*/gi, '\n'],
  [/\s*\b(full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (mark|point)\b/gi, '!'],
  [/\s*\bcolon\b/gi, ':'],
];

/** What was said, with spoken punctuation turned into marks (English only: other languages keep their words). */
export function spoken(text: string, lang = 'en'): string {
  if (!lang.toLowerCase().startsWith('en')) return text;
  let out = text;
  for (const [re, mark] of MARKS) out = out.replace(re, mark);
  // A space after a mark that ends a phrase, unless the next thing is a new line.
  return out.replace(/([.,?!:])(?=[^\s\n])/g, '$1 ').trim();
}

/** `chunk` added after `before` as typing would be: a space between words, a capital after a sentence's end. */
export function joinDictation(before: string, chunk: string): string {
  if (!chunk) return before;
  const ended = before.trim() === '' || /[.?!]\s*$/.test(before) || /\n\s*$/.test(before);
  const piece = ended ? chunk.charAt(0).toUpperCase() + chunk.slice(1) : chunk;
  const gap = before === '' || /\s$/.test(before) || /^[.,?!:\n]/.test(piece) ? '' : ' ';
  return before + gap + piece;
}
