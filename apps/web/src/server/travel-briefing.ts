import prisma from '@/lib/db';
import { addDays, stopDates } from '@/lib/travel-plan';
import { briefing, timetable } from '@/lib/travel-today';
import { notifyMany } from './email';
import { travelWeather } from './travel';

// M255: the morning briefing. Once a day (the daily jobs), everyone on a trip that's under way gets an in-app note
// (email: false) with today's city, its first places and their times, and the weather. Sent once a trip a day (the
// notification's link carries the date, so a second run finds it). About five queries and one weather call a trip.

type Trip = { id: string; startDate: string | null; stops: { id: string; name: string; lat: number | null; lon: number | null; days: number }[] };

export async function morningBriefings(room: () => number, now = new Date()): Promise<{ done: boolean; info: number }> {
  const today = now.toISOString().slice(0, 10);
  const trips: Trip[] = await prisma.travelTrip.findMany({
    where: { startDate: { lte: today, gte: addDays(today, -60) } },
    select: { id: true, startDate: true, stops: { orderBy: { position: 'asc' }, select: { id: true, name: true, lat: true, lon: true, days: true } } },
    take: 100,
  });
  let sent = 0;
  for (const t of trips) {
    const dates = stopDates(t.startDate, t.stops);
    const i = dates.findIndex((d) => d.from! <= today && today <= d.to!);
    if (i < 0) continue;
    if (room() < 8) return { done: false, info: sent };
    const link = `/travel/trip?id=${t.id}&part=today&on=${today}`;
    if (await prisma.notification.findFirst({ where: { link }, select: { id: true } })) continue;
    const stop = t.stops[i], day = dates[i].offset + Math.round((Date.parse(today) - Date.parse(dates[i].from!)) / 86_400_000);
    const [items, members] = await Promise.all([
      prisma.travelTripItem.findMany({ where: { tripId: t.id, stopId: stop.id, day: day - dates[i].offset }, orderBy: { position: 'asc' }, take: 30 }),
      prisma.travelTripMember.findMany({ where: { tripId: t.id }, select: { userId: true }, take: 12 }),
    ]);
    const weather = stop.lat !== null && stop.lon !== null ? await travelWeather(null as never, { lat: String(stop.lat), lon: String(stop.lon) }).then((w) => w.days.find((d) => d.date === today) ?? null).catch(() => null) : null;
    const b = briefing(stop.name.split('/').pop()!.replace(/\s*\([^)]*\)/, ''), day, timetable(items), weather);
    await notifyMany(members.map((m) => m.userId), { type: 'event', title: b.title, body: b.body, link, email: false });
    sent++;
  }
  return { done: true, info: sent };
}
