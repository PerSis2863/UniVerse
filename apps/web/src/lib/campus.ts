// Shared validation for admin-managed campus info (/api/campus-items).

export const CAMPUS_KINDS = ['SERVICE', 'LINK', 'EVENT'] as const;

export function cleanCampusItem(b: any) {
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const url = str(b.url, 500);
  const startAt = typeof b.startAt === 'string' && !isNaN(Date.parse(b.startAt)) ? new Date(b.startAt) : null;
  return {
    category: str(b.category, 60),
    title: str(b.title, 120),
    description: str(b.description, 1000),
    url: url && /^https?:\/\//i.test(url) ? url : null,
    location: str(b.location, 120),
    hours: str(b.hours, 120),
    startAt,
  };
}
