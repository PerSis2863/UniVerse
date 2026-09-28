import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSessionUser } from '@/lib/server-auth';

// Platform-wide search for the ⌘K palette: courses, groups, NGO projects, internships and
// knowledge-hub resources the caller can see, with the page each result opens.

export interface SearchResult {
  type: 'course' | 'group' | 'project' | 'internship' | 'resource';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const LIMIT = 5;

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const role = user.role;
  const student = role === 'STUDENT';
  const admin = role === 'ADMIN';
  const qs = encodeURIComponent(q);
  // SQLite LIKE is case-insensitive for ASCII.
  const text = (...fields: string[]) => ({ OR: fields.map((f) => ({ [f]: { contains: q } })) });

  const [courses, groups, projects, internships, resources] = await Promise.all([
    prisma.course.findMany({
      where: { ...text('name', 'code', 'department'), ...(admin ? {} : { status: 'PUBLISHED' as const }) },
      select: { id: true, name: true, code: true, department: true },
      take: LIMIT,
    }),
    student
      ? prisma.group.findMany({ where: { isPublic: true, ...text('name', 'description', 'category') }, select: { id: true, name: true, category: true }, take: LIMIT })
      : [],
    student || admin
      ? prisma.nGOProject.findMany({
          where: { isActive: true, ...text('name', 'description', 'location') },
          select: { id: true, name: true, ngo: { select: { name: true } } },
          take: LIMIT,
        })
      : [],
    student || admin
      ? prisma.internship.findMany({
          where: { isActive: true, ...text('title', 'description', 'location') },
          select: { id: true, title: true, location: true, company: { select: { name: true } } },
          take: LIMIT,
        })
      : [],
    prisma.knowledgeHubResource.findMany({
      where: { AND: [admin ? {} : { OR: [{ isPublic: true }, { authorId: user.id }] }, text('title', 'description', 'category')] },
      select: { id: true, title: true, category: true },
      take: LIMIT,
    }),
  ]);

  const coursePage = (id: string) => (student ? `/student/courses/${id}` : admin ? '/admin/courses' : `/teacher/blackboard?course=${id}`);
  const results: SearchResult[] = [
    ...courses.map((c) => ({ type: 'course' as const, id: c.id, title: c.name, subtitle: [c.code, c.department].filter(Boolean).join(' · '), href: coursePage(c.id) })),
    ...groups.map((g) => ({ type: 'group' as const, id: g.id, title: g.name, subtitle: g.category ?? 'Group', href: `/student/groups?q=${encodeURIComponent(g.name)}` })),
    ...projects.map((p) => ({
      type: 'project' as const,
      id: p.id,
      title: p.name,
      subtitle: p.ngo?.name,
      href: admin ? '/admin/impact-metrics' : `/student/impact/ngo-marketplace?q=${encodeURIComponent(p.name)}`,
    })),
    ...internships.map((i) => ({
      type: 'internship' as const,
      id: i.id,
      title: i.title,
      subtitle: [i.company?.name, i.location].filter(Boolean).join(' · '),
      href: admin ? '/admin/internships' : `/student/internships?q=${encodeURIComponent(i.title)}`,
    })),
    ...resources.map((r) => ({
      type: 'resource' as const,
      id: r.id,
      title: r.title,
      subtitle: r.category ?? 'Knowledge hub',
      href: student ? `/student/knowledge-hub?q=${qs}` : admin ? '/admin/knowledge-hub' : '/teacher/knowledge',
    })),
  ];
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
