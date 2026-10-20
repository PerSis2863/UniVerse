// Shared validation for admin-managed campus info (/api/campus-items).
import { TICKET_CURRENCIES, ticketPrice } from './student-life';

// MENU (upgrade 7): one dining menu: startAt is its day, category the meal, description one dish per line.
export const CAMPUS_KINDS = ['SERVICE', 'LINK', 'EVENT', 'MENU'] as const;

export function cleanCampusItem(b: Record<string, unknown>) {
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
    // Event seats (upgrade 7); empty means no limit.
    capacity: Number.isInteger(Number(b.capacity)) && Number(b.capacity) > 0 ? Math.min(Number(b.capacity), 100_000) : null,
    // A ticket price (Stage 5 · Q17), in whole units; empty or 0 means free.
    price: ticketPrice(b.price),
    currency: (TICKET_CURRENCIES as readonly string[]).includes(String(b.currency)) ? String(b.currency) : 'INR',
  };
}
