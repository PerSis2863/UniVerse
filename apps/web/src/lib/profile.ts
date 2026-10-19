// The profile others see (Stage 5 · Q18): pronouns, about, links and availability, checked the same
// way on the server and in Settings.

export const PRONOUN_SUGGESTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'];
export const MAX_LINKS = 5;
export interface ProfileLink { label: string; url: string }

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Pronouns as typed (up to 30 characters, letters, slashes, spaces and hyphens), or null. */
export function cleanPronouns(raw: unknown): string | null {
  const v = text(raw, 30);
  return v && /^[\p{L}\s/,-]+$/u.test(v) ? v : null;
}

/** A short "about me" (up to 300 characters, line breaks kept), or null. */
export const cleanBio = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300) || null : null);

/** When people can usually reach me, e.g. "Usually free Tue and Thu afternoons" (up to 120). */
export const cleanAvailability = (raw: unknown) => text(raw, 120) || null;

/** A name for a link from its address: "GitHub", "LinkedIn", or the site's name. */
export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known: Record<string, string> = { 'github.com': 'GitHub', 'linkedin.com': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X', 'instagram.com': 'Instagram', 'youtube.com': 'YouTube', 'behance.net': 'Behance', 'dribbble.com': 'Dribbble', 'medium.com': 'Medium', 'kaggle.com': 'Kaggle', 'orcid.org': 'ORCID', 'scholar.google.com': 'Google Scholar' };
    return known[host] ?? host;
  } catch { return 'Link'; }
}

/** Up to 5 links: https only (http is made https), a label (from the address when empty). */
export function cleanLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const r of raw.slice(0, 10)) {
    const o = (r ?? {}) as Partial<ProfileLink>;
    let url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!url) continue;
    if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
    url = url.replace(/^http:\/\//i, 'https://');
    try { if (new URL(url).protocol !== 'https:') continue; } catch { continue; }
    if (url.length > 300 || out.some((l) => l.url === url)) continue;
    out.push({ label: text(o.label, 30) || linkLabel(url), url });
    if (out.length === MAX_LINKS) break;
  }
  return out;
}
