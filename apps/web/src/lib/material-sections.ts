// A course material's text split into reading sections (Stage 5 · D8): the reader shows them one
// after another, and each is translated (and cached) on its own. The server and the browser split
// the same way, so "section 3" means the same text on both sides.

const SIZE = 1800;

export function materialSections(text: string, size = SIZE): string[] {
  const paras = text.replace(/\r/g, '').split(/\n{2,}|\n(?=\s*[-•*\d]+[.)]?\s)/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > size) {
      push();
      // A very long paragraph: cut at sentence ends, or hard at the size.
      let rest = p;
      while (rest.length > size) {
        const cut = Math.max(rest.lastIndexOf('. ', size), rest.lastIndexOf('? ', size), rest.lastIndexOf('! ', size));
        const at = cut > size / 2 ? cut + 1 : size;
        out.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      cur = rest;
    } else if (cur.length + p.length + 2 > size) {
      push();
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  push();
  return out;
}
