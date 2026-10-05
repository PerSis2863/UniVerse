// Link previews for chat messages: the title and description a page gives for sharing (Open
// Graph tags), read once by the server when the message is sent and saved on it. No images: they
// would be loaded by every reader's browser from the other site (it would see who reads the chat).

export interface LinkPreview { url: string; title: string; description: string | null; site: string }

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/i;
const MAX_BYTES = 200_000;

export const firstUrl = (text: string) => text.match(URL_RE)?.[0]?.replace(/[.,!?;:]+$/, '') ?? null;

function privateHost(host: string) {
  return host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^\[/.test(host)
    || /^(10|127|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

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
  if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return null;
  try {
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(3500), headers: { 'User-Agent': 'UniVerseBot/1.0 (link preview; +https://universeimpact.com)', Accept: 'text/html' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html') || !res.body) return null;
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
