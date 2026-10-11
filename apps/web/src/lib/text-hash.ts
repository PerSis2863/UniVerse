/** A short hash of a text (FNV-1a and its length), to notice when it was edited (Stage 5 · B7.5). */
export function textHash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
}
