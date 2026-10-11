// A wiki of pages (Stage 5 · B9.2): pages under pages, and links between them.

/** The pages a document links to (/docs/<id> links in its HTML, same site or full address). */
export function docLinkIds(html: string, self?: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href="(?:https?:\/\/[^"/]+)?\/docs\/([a-z0-9]{20,32})(?:[?#][^"]*)?"/gi)) if (m[1] !== self) out.add(m[1]);
  return [...out].slice(0, 50);
}

/** Pages with no parent among the ones shown (a parent you can't see counts as none). */
export function topLevel<T extends { id: string; parentId: string | null }>(docs: T[]): T[] {
  const ids = new Set(docs.map((d) => d.id));
  return docs.filter((d) => !d.parentId || !ids.has(d.parentId));
}

export function childrenOf<T extends { id: string; parentId: string | null }>(docs: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const d of docs) if (d.parentId) map.set(d.parentId, [...(map.get(d.parentId) ?? []), d]);
  return map;
}

/** True when putting a page under `parent` would put it under itself. */
export function makesLoop(page: string, parent: string | null, parentOf: (id: string) => string | null | undefined): boolean {
  for (let at = parent, i = 0; at && i < 50; at = parentOf(at) ?? null, i++) if (at === page) return true;
  return false;
}
