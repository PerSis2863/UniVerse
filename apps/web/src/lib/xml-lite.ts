// A small XML reader for course cartridges (Stage 5 · B2: imsmanifest.xml, web links, QTI): elements,
// attributes, text and CDATA; comments, declarations and doctypes skipped; no external entities
// (nothing is fetched or expanded beyond the five standard ones and character references).
// Names keep no namespace prefix ("lomimscc:string" → "string"), as cartridges vary in theirs.

export interface XmlNode { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const local = (name: string) => name.slice(name.indexOf(':') + 1);

/** Parses XML into a tree; throws on text that isn't XML. Big documents are refused (5 MB). */
export function parseXml(xml: string): XmlNode {
  if (xml.length > 5_000_000) throw new Error('This file is too big to read.');
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let at = 0;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    const top = stack[stack.length - 1];
    if (m.index > at) top.text += decodeEntities(xml.slice(at, m.index));
    at = tag.lastIndex;
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (!m[3]) continue; // a comment, declaration or doctype
    const name = local(m[3]);
    if (m[2]) {
      if (stack.length < 2 || top.name !== name) throw new Error('This file isn’t valid XML.');
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = decodeEntities(a[2] ?? a[3] ?? '');
    const node: XmlNode = { name, attrs, children: [], text: '' };
    top.children.push(node);
    if (!m[5]) {
      if (stack.length > 200) throw new Error('This file is nested too deeply.');
      stack.push(node);
    }
  }
  if (stack.length !== 1 || !root.children.length) throw new Error('This file isn’t valid XML.');
  return root.children[0];
}

/** Child elements with this name. */
export const kids = (n: XmlNode | undefined, name: string) => (n?.children ?? []).filter((c) => c.name === name);
/** The first child element with this name. */
export const kid = (n: XmlNode | undefined, name: string) => n?.children.find((c) => c.name === name);
/** The first element with this name anywhere inside. */
export function find(n: XmlNode | undefined, name: string): XmlNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) { if (c.name === name) return c; const f = find(c, name); if (f) return f; }
  return undefined;
}
/** Every element with this name inside, in document order. */
export function findAll(n: XmlNode | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const c of n?.children ?? []) { if (c.name === name) out.push(c); findAll(c, name, out); }
  return out;
}
/** All the text inside an element, trimmed. */
export const textOf = (n: XmlNode | undefined): string => (n ? (n.text + n.children.map(textOf).join(' ')).replace(/\s+/g, ' ').trim() : '');
