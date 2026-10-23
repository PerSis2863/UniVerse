// "Where am I" above each page's title (M3: the app has grown big): the menu group and entry the
// page belongs to, e.g. "Schooling › Courses", from the side menu itself (navByRole in
// src/components/layout/Sidebar.tsx), so the trail always matches the menu.

type Entry = { href?: string; label: string; also?: string[]; subItems?: { href: string; label: string; also?: string[] }[] };
export type Crumbs = { group?: string; entry: { label: string; href: string } };

const base = (href: string) => href.split('?')[0];

/** How well `pathname` belongs to a menu entry: its page or a tab of it (exact), or a page under it. */
function score(pathname: string, href: string | undefined, also?: string[]): number {
  if (!href) return 0;
  const h = base(href);
  const pages = [h, ...(also ?? [])];
  if (pages.includes(pathname)) return 1000 + h.length;
  const under = pages.filter((p) => p !== '/' && pathname.startsWith(`${p}/`));
  return under.length ? Math.max(...under.map((p) => p.length)) : 0;
}

/** The menu group and entry of a page, or null when it's in no menu (then nothing is shown). */
export function crumbsFor(nav: Entry[], pathname: string): Crumbs | null {
  let best: { s: number; c: Crumbs } | null = null;
  for (const item of nav) {
    const s = score(pathname, item.href, item.also);
    if (s && item.href && (!best || s > best.s)) best = { s, c: { entry: { label: item.label, href: base(item.href) } } };
    for (const sub of item.subItems ?? []) {
      const t = score(pathname, sub.href, sub.also);
      if (t && (!best || t > best.s)) best = { s: t, c: { group: item.label, entry: { label: sub.label, href: base(sub.href) } } };
    }
  }
  return best?.c ?? null;
}
