// Link previews for chat messages: the title and description a page gives for sharing (Open
// Graph tags), read once by the server when the message is sent and saved on it. No images: they
// would be loaded by every reader's browser from the other site (it would see who reads the chat).

export interface LinkPreview { url: string; title: string; description: string | null; site: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/i;
const MAX_BYTES = 200_000;

export const firstUrl = (text: string) => text.match(URL_RE)?.[0]?.replace(/[.,!?;:]+$/, '') ?? null;

/** An address on a private or internal network (M337: also shared-address 100.64/10, benchmarking 198.18/15,
 *  multicast and reserved space, `*.localhost`, cloud metadata names and any IPv6 literal). */
export function privateHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa') || /^\[/.test(h) || !h.includes('.')
    || h === 'metadata.google.internal' || /^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || /^198\.1[89]\./.test(h) || /^192\.0\.[02]\./.test(h) || /^(22[4-9]|2[3-5]\d)\./.test(h);
}

/** Only public http(s) addresses on the usual ports. */
const allowedUrl = (u: URL) => /^https?:$/.test(u.protocol) && !privateHost(u.hostname) && !u.username && !u.password && (u.port === '' || u.port === '80' || u.port === '443');

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();

function meta(html: string, ...names: string[]) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return null;
}

export async function linkPreview(raw: string): Promise<LinkPreview | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (!allowedUrl(u)) return null;
  try {
    // M337: redirects followed by hand (at most 3), each new address checked as the first was: a public page could
    // otherwise send the server on to an internal one.
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(3500), headers: { 'User-Agent': 'UniVerseBot/1.0 (link preview; +https://universeimpact.com)', Accept: 'text/html' } });
      const to = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!to) break;
      void res.body?.cancel().catch(() => {});
      try { u = new URL(to, u); } catch { return null; }
      if (hop === 3 || !allowedUrl(u)) return null;
    }
    if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('text/html') || !res.body) return null;
    // Only the start of the page (the <head> is enough).
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    void reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const title = meta(html, 'og:title', 'twitter:title') ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '');
    if (!title) return null;
    const description = meta(html, 'og:description', 'twitter:description', 'description');
    const site = meta(html, 'og:site_name') ?? u.hostname.replace(/^www\./, '');
    return { url: u.href, title: title.slice(0, 160), description: description?.slice(0, 240) ?? null, site: site.slice(0, 60) };
  } catch {
    return null;
  }
}
