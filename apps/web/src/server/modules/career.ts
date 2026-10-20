import type { Router } from '../router';
import prisma from '@/lib/db';

export default function careerModule(router: Router) {
  const r = router.controller('career');

  r.get('opportunities', async () => {
    const internships = await prisma.internship.findMany({
      where: { isActive: true },
      include: { company: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    return internships.map((i) => ({
      id: i.id,
      title: i.title,
      company: i.company?.name || 'Company',
      location: i.location || 'Remote',
      type: i.type?.replace('_', ' ') || 'Internship',
      // No made-up date: an opening without a deadline shows none.
      deadline: i.deadline ?? null,
      // No logo: the page shows the company's initials (no third-party image service).
      logo: i.company?.logoUrl || null,
    }));
  });

  r.get('events', async () => {
    const events = await prisma.calendarEvent.findMany({
      where: { type: 'CAREER', startAt: { gte: new Date() } },
      orderBy: { startAt: 'asc' },
      take: 3,
    });
    return events.map((e) => ({ id: e.id, title: e.title, date: e.startAt.toISOString(), location: e.description || 'Virtual' }));
  });
}
