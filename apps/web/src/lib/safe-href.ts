/**
 * Links that come from users or the database go through this before being rendered, so a
 * `javascript:` or `data:` "link" can never run code for whoever clicks it.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (u.startsWith('/') && !u.startsWith('//')) return u; // this site
  return /^(https?:|mailto:|tel:)/i.test(u) ? u : undefined;
}
