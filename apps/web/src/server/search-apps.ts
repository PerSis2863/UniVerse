import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

// Search across the apps (M303), beside UniVersity's (src/app/api/search/route.ts): my trips and saved
// places (Travel), my brand's products and any brand's public page (Trace), open help requests and offers
// by title and place (Relief: what the public map shows, never who or exactly where), Green events and
// my teams, and the apps' own pages by name ("trip planner", "free room"…). Five of each at most.

export type AppHit = { type: 'trip' | 'place' | 'brand' | 'product' | 'relief' | 'green' | 'page'; id: string; title: string; subtitle?: string; href: string };

const LIMIT = 5;
const DAY = 86_400_000;

/** The apps' own pages people look for by name. */
export const APP_PAGES: { title: string; words: string; href: string; app: string }[] = [
  { title: 'Trip planner', words: 'trips plan itinerary holiday travel', href: '/travel/saved', app: 'Aether' },
  { title: 'Find where to go', words: 'destination ideas where to go budget travel', href: '/travel?view=find', app: 'Aether' },
  { title: 'Aether map', words: 'map places nearby directions', href: '/travel?view=map', app: 'Aether' },
  { title: 'Scan a product', words: 'scan passport verify fake product trace', href: '/t/demo', app: 'Trace' },
  { title: 'Trace wallet', words: 'points wallet rewards shop', href: '/trace/wallet', app: 'Trace' },
  { title: 'Relief map', words: 'help needs offers emergency relief map', href: '/relief', app: 'Relief' },
  { title: 'Be ready', words: 'emergency plan go bag first aid ready', href: '/relief?view=ready', app: 'Relief' },
  // M395: Green's parts in the apps of daily life.
  { title: 'Log a climate action', words: 'green co2 carbon action streak', href: '/student/life/green', app: 'UniVersity' },
  { title: 'Community events', words: 'cleanup events planting green community', href: '/relief?view=events', app: 'Relief' },
  { title: 'Greener journeys', words: 'journey commute train bus bike car flight co2 compare green', href: '/travel?view=journeys', app: 'Aether' },
  { title: 'Green places', words: 'recycling repair refill bike charging green places map', href: '/travel?view=green', app: 'Aether' },
  { title: 'Swap & repair', words: 'swap give away repair fix second hand reuse', href: '/trace/swap', app: 'Trace' },
  { title: 'Carbon footprint for a company', words: 'business carbon footprint ghg scope report', href: '/trace/carbon', app: 'Trace' },
  { title: 'Find a free room', words: 'room free book campus map', href: '/campus-map', app: 'UniVersity' },
  { title: 'Paper exams', words: 'exam paper print versions rubric', href: '/teacher/quizzes', app: 'UniVersity' },
  { title: 'Office hours', words: 'office hours book teacher meeting', href: '/calls', app: 'UniVersity' },
  { title: 'Games', words: 'games play quiz', href: '/play', app: 'UniVersity' },
];

export function pagesFor(q: string): AppHit[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return APP_PAGES.filter((p) => words.every((w) => `${p.title} ${p.words}`.toLowerCase().includes(w)))
    .slice(0, LIMIT).map((p) => ({ type: 'page', id: p.href, title: p.title, subtitle: p.app, href: p.href }));
}

export async function searchApps(user: SessionUser, q: string): Promise<AppHit[]> {
  const like = { contains: q };
  const since = new Date(Date.now() - 30 * DAY);
  const member = await prisma.traceBrandMember.findFirst({ where: { userId: user.id }, select: { brandId: true } });
  const [trips, saved, brands, products, relief, events, teams] = await Promise.all([
    prisma.travelTrip.findMany({ where: { name: like, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] }, select: { id: true, name: true }, take: LIMIT }),
    prisma.travelSaved.findMany({ where: { userId: user.id, name: like }, select: { id: true, name: true, kind: true }, take: LIMIT }),
    prisma.traceBrand.findMany({ where: { name: like }, select: { id: true, name: true, slug: true }, take: LIMIT }),
    member ? prisma.traceProduct.findMany({ where: { brandId: member.brandId, name: like }, select: { id: true, name: true }, take: LIMIT }) : Promise.resolve([]),
    prisma.reliefPost.findMany({ where: { status: 'OPEN', createdAt: { gte: since }, OR: [{ title: like }, { place: like }] }, select: { id: true, title: true, type: true, place: true }, orderBy: { createdAt: 'desc' }, take: LIMIT }),
    prisma.greenEvent.findMany({ where: { hidden: false, OR: [{ title: like }, { place: like }] }, select: { id: true, title: true, place: true }, orderBy: { createdAt: 'desc' }, take: LIMIT }),
    prisma.greenMember.findMany({ where: { userId: user.id }, select: { teamId: true }, take: 50 }).then((m) => (m.length ? prisma.greenTeam.findMany({ where: { id: { in: m.map((x) => x.teamId) }, name: like }, select: { id: true, name: true }, take: LIMIT }) : [])),
  ]);
  return [
    ...trips.map((t): AppHit => ({ type: 'trip', id: t.id, title: t.name, subtitle: 'Your trip', href: `/travel/trip?id=${t.id}` })),
    ...saved.map((s): AppHit => ({ type: 'place', id: s.id, title: s.name, subtitle: 'Saved place', href: '/travel/saved' })),
    ...products.map((p): AppHit => ({ type: 'product', id: p.id, title: p.name, subtitle: 'Your product', href: '/trace' })),
    ...brands.map((b): AppHit => ({ type: 'brand', id: b.id, title: b.name, subtitle: 'Brand page', href: `/b/${b.slug}` })),
    ...relief.map((r): AppHit => ({ type: 'relief', id: r.id, title: r.title, subtitle: [r.type === 'OFFER' ? 'Offer of help' : 'Help needed', r.place].filter(Boolean).join(' · '), href: '/relief' })),
    ...events.map((e): AppHit => ({ type: 'green', id: e.id, title: e.title, subtitle: `Community event · ${e.place}`, href: '/relief?view=events' })),
    ...teams.map((t): AppHit => ({ type: 'green', id: t.id, title: t.name, subtitle: 'Your Green team', href: '/student/life/green?view=teams' })),
    ...pagesFor(q),
  ];
}
