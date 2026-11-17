// UniVerse Travel's guides (M202): a Wikivoyage article (its raw wiki text) read into what the app shows:
// the opening, each part a traveller wants (understand, get in, get around, see, do, buy, eat, drink,
// sleep, stay safe, respect, talk, go next) as plain paragraphs, every listed place with its details
// (address, hours, price, phone, website, position), a big city's districts and a country's cities, the
// banner photo and where it sits. Pure: src/server/travel.ts fetches and keeps it. The text is
// Wikivoyage's (CC BY-SA): the app credits it and links back.

export const GUIDE_PARTS = ['understand', 'get in', 'get around', 'see', 'do', 'buy', 'eat', 'drink', 'sleep', 'stay safe', 'respect', 'talk', 'go next'] as const;
export type GuidePart = (typeof GUIDE_PARTS)[number];
export const LISTING_KINDS = ['see', 'do', 'buy', 'eat', 'drink', 'sleep', 'go', 'other'] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export interface Listing {
  kind: ListingKind; name: string; alt?: string; url?: string; address?: string; directions?: string;
  phone?: string; hours?: string; price?: string; lat?: number; lon?: number; text?: string;
  /** The sub-heading it sits under ("Budget", "Fine dining"). */
  group?: string;
  /** M232: the guide its name links to (a big city's sights link to their district's: "Paris/7th arrondissement"). */
  guide?: string;
}
export interface GuideSection { part: GuidePart; title: string; text: string[]; listings: Listing[] }
export interface Guide {
  title: string; summary: string[]; banner?: string; lat?: number; lon?: number; parent?: string;
  sections: GuideSection[];
  /** A big city's districts, or a country's or region's cities and places: each its own guide. */
  places: { title: string; name: string; text?: string }[];
}

const KINDS = new Set<string>(LISTING_KINDS);
const PART_OF: Record<string, GuidePart> = Object.fromEntries(GUIDE_PARTS.map((p) => [p, p]));
// Other headings that mean the same part.
Object.assign(PART_OF, { 'get out': 'go next', 'stay healthy': 'stay safe', 'cope': 'respect', 'learn': 'do', 'work': 'do' });

/** The end of the {{…}} or [[…]] that opens at `i` (the index just past its closing brackets). */
export function close(s: string, i: number, open: string, end: string) {
  let depth = 0;
  for (let j = i; j < s.length - 1; j++) {
    if (s[j] === open[0] && s[j + 1] === open[1]) { depth++; j++; } else if (s[j] === end[0] && s[j + 1] === end[1]) { depth--; j++; if (depth === 0) return j + 1; }
  }
  return s.length;
}

/** A template's parameters, split at the top level (not inside [[…]] or {{…}}): positional and named. */
export function templateParams(body: string) {
  const parts: string[] = [];
  let cur = '', sq = 0, cu = 0;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '[[') { sq++; cur += two; i++; continue; }
    if (two === ']]') { sq--; cur += two; i++; continue; }
    if (two === '{{') { cu++; cur += two; i++; continue; }
    if (two === '}}') { cu--; cur += two; i++; continue; }
    if (body[i] === '|' && sq <= 0 && cu <= 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  const named: Record<string, string> = {}, pos: string[] = [];
  for (const p of parts.slice(1)) {
    const m = /^\s*([a-zA-Z][\w ]*?)\s*=([\s\S]*)$/.exec(p);
    if (m) named[m[1].toLowerCase()] = m[2].trim(); else pos.push(p.trim());
  }
  return { name: parts[0].trim().toLowerCase(), named, pos };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', deg: '°', times: '×', euro: '€', pound: '£', yen: '¥' };

/** Wiki text to plain text: links to their words, templates and files gone, bold and italics plain. */
export function plain(w: string): string {
  let s = w.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>/]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<\/?[a-z][^>]*>/gi, '');
  // Templates: a few keep their words ({{lang|ja|京都}}, {{nowrap|…}}); the rest go.
  for (let guard = 0; guard < 200; guard++) {
    const i = s.indexOf('{{');
    if (i < 0) break;
    const j = close(s, i, '{{', '}}');
    const t = templateParams(s.slice(i + 2, j - 2));
    const keep = t.name === 'lang' ? t.pos[1] ?? '' : t.name === 'nowrap' || t.name === 'small' ? t.pos[0] ?? '' : t.name === 'convert' ? `${t.pos[0] ?? ''} ${t.pos[1] ?? ''}` : t.name === 'km' || t.name === 'mi' ? `${t.pos[0] ?? ''} ${t.name}` : '';
    s = s.slice(0, i) + keep + s.slice(j);
  }
  // Files and pictures go; other links keep their words.
  for (let guard = 0; guard < 500; guard++) {
    const i = s.indexOf('[[');
    if (i < 0) break;
    const j = close(s, i, '[[', ']]');
    const inner = s.slice(i + 2, j - 2);
    const file = /^\s*(file|image|category)\s*:/i.test(inner);
    const words = file ? '' : (inner.split('|').pop() ?? '').replace(/^[^:]*:(?!\s)/, '');
    s = s.slice(0, i) + words + s.slice(j);
  }
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]]+\]/g, '').replace(/'{2,}/g, '');
  s = s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));
  return s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

const num = (v?: string) => { const n = Number(v); return v && Number.isFinite(n) && n !== 0 ? n : undefined; };
const clean = (v?: string) => { const t = v ? plain(v) : ''; return t && t !== '-' ? t : undefined; };

/** A listing template ({{see|name=…}}, {{listing|type=eat|…}}) to a place. */
export function listingFrom(t: ReturnType<typeof templateParams>, group?: string): Listing | null {
  const kind = (t.name === 'listing' || t.name === 'marker' ? (t.named.type ?? 'other') : t.name).toLowerCase();
  const name = clean(t.named.name);
  if (!name || !KINDS.has(kind) && t.name !== 'listing') return null;
  const url = t.named.url?.trim();
  const link = /^\s*\[\[([^|\]#]+)/.exec(t.named.name ?? '');
  return {
    kind: (KINDS.has(kind) ? kind : 'other') as ListingKind, name,
    alt: clean(t.named.alt), url: url && /^https?:\/\//.test(url) ? url : undefined,
    address: clean(t.named.address), directions: clean(t.named.directions), phone: clean(t.named.phone),
    hours: clean(t.named.hours), price: clean(t.named.price), lat: num(t.named.lat), lon: num(t.named.long ?? t.named.lon),
    text: clean(t.named.content ?? t.named.description), group, guide: link?.[1].trim() || undefined,
  };
}

/** Paragraphs from a part's own text (listings taken out), at most `max`. */
function paragraphs(w: string, max: number) {
  return plain(w).split(/\n{1,}/).map((p) => p.replace(/^[*#:;]+\s*/, '').trim()).filter((p) => p.length > 30).slice(0, max);
}

/** Reads a Wikivoyage article. */
export function readGuide(title: string, wiki: string): Guide {
  const g: Guide = { title, summary: [], sections: [], places: [] };
  const banner = /\{\{\s*pagebanner\s*\|\s*([^|}\n]+\.(?:jpe?g|png|webp|tiff?))/i.exec(wiki);
  if (banner) g.banner = banner[1].trim();
  const geo = /\{\{\s*geo\s*\|\s*(-?[\d.]+)\s*\|\s*(-?[\d.]+)/i.exec(wiki);
  if (geo) { g.lat = Number(geo[1]); g.lon = Number(geo[2]); }
  const part = /\{\{\s*isPartOf\s*\|\s*([^|}]+)/i.exec(wiki);
  if (part) g.parent = part[1].trim();
  // Split at the top headings (== X ==); sub-headings (=== Budget ===) group listings.
  const heads = [...wiki.matchAll(/^==\s*([^=\n][^\n]*?)\s*==\s*$/gm)];
  g.summary = paragraphs(wiki.slice(0, heads[0]?.index ?? wiki.length), 3);
  heads.forEach((h, i) => {
    const title = plain(h[1]), key = title.toLowerCase();
    const body = wiki.slice(h.index! + h[0].length, heads[i + 1]?.index ?? wiki.length);
    if (key === 'districts' || key === 'cities' || key === 'other destinations' || key === 'regions') {
      // {{Regionlist|regionNname=[[A/B|B]]|regionNdescription=…}} and bullet lists of links.
      const rl = /\{\{\s*regionlist/i.exec(body);
      if (rl) {
        const t = templateParams(body.slice(rl.index + 2, close(body, rl.index, '{{', '}}') - 2));
        for (let n = 1; n < 30; n++) {
          const nm = t.named[`region${n}name`];
          if (!nm) continue;
          const link = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(nm);
          if (link) g.places.push({ title: link[1].trim(), name: plain(link[2] ?? link[1]), text: clean(t.named[`region${n}description`]) });
          else {
            // M232: a group of districts ("Central Paris") whose guides are its items ([[Paris/1st arrondissement|1st arr.]]);
            // the description has a part per item ('''1e''': …): an area each, else the group as one.
            const items = [...(t.named[`region${n}items`] ?? '').matchAll(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g)];
            const desc = t.named[`region${n}description`] ?? '';
            const bits = desc.split(/'''[^'\n]{1,16}''':\s*/).map((x) => x.trim()).filter(Boolean);
            if (items.length && bits.length === items.length) items.forEach((it, k) => g.places.push({ title: it[1].trim(), name: `${plain(it[2] ?? it[1])}, ${plain(nm)}`, text: clean(bits[k]) }));
            else if (items.length) g.places.push({ title: items[0][1].trim(), name: plain(nm), text: clean(desc) });
          }
        }
      }
      for (const line of body.split('\n')) {
        if (!/^\s*\*/.test(line)) continue;
        const m = /\[\[([^|\]#:]+)(?:\|([^\]]+))?\]\]/.exec(line) ?? /\{\{\s*marker[^}]*name\s*=\s*\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/i.exec(line);
        if (!m || g.places.some((p) => p.title === m[1].trim())) continue;
        const rest = plain(line.replace(/^\s*\*+/, '')).replace(/^[^—–-]*[—–-]\s*/, '');
        g.places.push({ title: m[1].trim(), name: plain(m[2] ?? m[1]), text: rest && rest !== plain(m[2] ?? m[1]) ? rest : undefined });
      }
      return;
    }
    const p = PART_OF[key];
    if (!p) return;
    // Listings, each under the sub-heading it follows.
    const listings: Listing[] = [];
    let text = '', last = 0, group: string | undefined;
    const subs = [...body.matchAll(/^===+\s*([^=\n]+?)\s*===+\s*$/gm)];
    let si = 0;
    for (let k = body.indexOf('{{'); k >= 0; k = body.indexOf('{{', k)) {
      const j = close(body, k, '{{', '}}');
      while (si < subs.length && subs[si].index! < k) group = plain(subs[si++][1]);
      const t = templateParams(body.slice(k + 2, j - 2));
      if (KINDS.has(t.name) || t.name === 'listing') {
        const l = listingFrom(t, group);
        if (l) {
          if (t.name !== 'listing' && KINDS.has(t.name)) l.kind = t.name as ListingKind;
          // A listing without a type takes its part's ("Eat" → eat).
          else if (l.kind === 'other' && KINDS.has(p)) l.kind = p as ListingKind;
          listings.push(l);
        }
        text += body.slice(last, k);
        last = j;
      }
      k = j;
    }
    text += body.slice(last);
    const existing = g.sections.find((s) => s.part === p);
    const paras = paragraphs(text.replace(/^===+.*===+\s*$/gm, ''), p === 'understand' ? 5 : 4);
    if (existing) { existing.text.push(...paras); existing.listings.push(...listings); }
    else g.sections.push({ part: p, title: p === 'go next' ? 'Go next' : title, text: paras, listings });
  });
  return g;
}

/** A guide page's address on Wikivoyage (for the credit link). */
export const wikivoyageUrl = (title: string) => `https://en.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
/** A Commons file's picture at a width (the banner, a place's photo). */
export const commonsImage = (file: string, width = 1280) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${width}`;
