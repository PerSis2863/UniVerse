import prisma from '@/lib/db';
import { BadRequestException, NotFoundException, ForbiddenException } from './http';
import { teaches } from '@/lib/course-access';

// Stage 5 · C7: Content Marketplace
// Allows teachers and faculty to publish curriculum packs and courses (free or paid)
// with reviews, ratings, revenue sharing, and one-click import into course boards.

export const MARKETPLACE_CATEGORIES = [
  'Computer Science',
  'Mathematics',
  'Engineering',
  'Sciences',
  'Business & Economics',
  'Humanities & Social Sciences',
  'Design & Arts',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const MARKETPLACE_LEVELS = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'ALL_LEVELS',
] as const;

export type MarketplaceLevel = (typeof MARKETPLACE_LEVELS)[number];

export interface MarketplaceModuleItem {
  title: string;
  kind: string; // PAGE, FILE, LINK, VIDEO, QUIZ, ASSIGNMENT, LIVE
  body?: string | null;
  url?: string | null;
  position: number;
}

export interface MarketplaceModule {
  title: string;
  summary?: string | null;
  position: number;
  items: MarketplaceModuleItem[];
}

export interface PublishPackInput {
  authorId: string;
  sourceCourseId?: string;
  title: string;
  summary: string;
  description?: string;
  category: string;
  level?: string;
  priceMinor?: number; // 0 = free
  currency?: string;
  estimatedHours?: number;
  thumbnailUrl?: string;
  modulesData?: MarketplaceModule[];
}

export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'pack'}-${suffix}`;
}

export async function extractCourseModules(courseId: string): Promise<MarketplaceModule[]> {
  const modules = await prisma.courseModule.findMany({
    where: { courseId },
    orderBy: { position: 'asc' },
    include: {
      items: {
        orderBy: { position: 'asc' },
        select: {
          title: true,
          kind: true,
          body: true,
          url: true,
          position: true,
        },
      },
    },
  });

  return modules.map((m) => ({
    title: m.title,
    summary: m.summary,
    position: m.position,
    items: m.items.map((it) => ({
      title: it.title,
      kind: it.kind,
      body: it.body,
      url: it.url,
      position: it.position,
    })),
  }));
}

export async function publishMarketplacePack(input: PublishPackInput) {
  const title = input.title.trim();
  const summary = input.summary.trim();

  if (!title || title.length < 3 || title.length > 100) {
    throw new BadRequestException('Title must be between 3 and 100 characters.');
  }

  if (!summary || summary.length < 10 || summary.length > 400) {
    throw new BadRequestException('Summary must be between 10 and 400 characters.');
  }

  const priceMinor = typeof input.priceMinor === 'number' && input.priceMinor >= 0 ? input.priceMinor : 0;
  const currency = (input.currency || 'INR').toUpperCase();
  const level = MARKETPLACE_LEVELS.includes(input.level as MarketplaceLevel)
    ? input.level!
    : 'ALL_LEVELS';

  let modules = input.modulesData;
  if (!modules || modules.length === 0) {
    if (input.sourceCourseId) {
      modules = await extractCourseModules(input.sourceCourseId);
    }
  }

  if (!modules || modules.length === 0) {
    // Fallback: create default starter module
    modules = [
      {
        title: 'Module 1: Introduction & Foundations',
        summary: 'Overview and core principles.',
        position: 0,
        items: [
          {
            title: 'Welcome & Syllabus',
            kind: 'PAGE',
            body: 'Welcome to this curriculum pack! Start with this foundation.',
            position: 0,
          },
        ],
      },
    ];
  }

  const modulesCount = modules.length;
  const itemsCount = modules.reduce((sum, m) => sum + (m.items?.length || 0), 0);
  const slug = slugifyTitle(title);

  return prisma.marketplacePack.create({
    data: {
      authorId: input.authorId,
      sourceCourseId: input.sourceCourseId || null,
      title,
      slug,
      summary,
      description: input.description?.trim() || null,
      thumbnailUrl: input.thumbnailUrl || null,
      category: input.category || 'Computer Science',
      level,
      priceMinor,
      currency,
      modulesData: JSON.stringify(modules),
      modulesCount,
      itemsCount,
      estimatedHours: input.estimatedHours || 5.0,
      status: 'PUBLISHED',
      revenueSharePct: 80,
    },
  });
}

export async function listMarketplacePacks(filters: {
  q?: string;
  category?: string;
  level?: string;
  priceFilter?: 'all' | 'free' | 'paid';
  sort?: 'rating' | 'downloads' | 'recent' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {
    status: 'PUBLISHED',
  };

  if (filters.category && filters.category !== 'All') {
    where.category = filters.category;
  }

  if (filters.level && filters.level !== 'ALL_LEVELS') {
    where.level = filters.level;
  }

  if (filters.priceFilter === 'free') {
    where.priceMinor = 0;
  } else if (filters.priceFilter === 'paid') {
    where.priceMinor = { gt: 0 };
  }

  if (filters.q && filters.q.trim()) {
    const term = filters.q.trim();
    where.OR = [
      { title: { contains: term } },
      { summary: { contains: term } },
      { category: { contains: term } },
    ];
  }

  let orderBy: Record<string, string> = { downloadsCount: 'desc' };
  if (filters.sort === 'rating') {
    orderBy = { ratingAvg: 'desc' };
  } else if (filters.sort === 'recent') {
    orderBy = { createdAt: 'desc' };
  } else if (filters.sort === 'price_asc') {
    orderBy = { priceMinor: 'asc' };
  } else if (filters.sort === 'price_desc') {
    orderBy = { priceMinor: 'desc' };
  }

  const limit = Math.min(filters.limit || 24, 100);
  const offset = filters.offset || 0;

  const [packs, total] = await Promise.all([
    prisma.marketplacePack.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.marketplacePack.count({ where }),
  ]);

  return { packs, total };
}

export async function getMarketplacePack(idOrSlug: string) {
  const pack = await prisma.marketplacePack.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!pack) throw new NotFoundException('Marketplace pack not found.');

  let parsedModules: MarketplaceModule[] = [];
  try {
    parsedModules = JSON.parse(pack.modulesData) as MarketplaceModule[];
  } catch {
    parsedModules = [];
  }

  return {
    ...pack,
    modules: parsedModules,
  };
}

export async function addMarketplaceReview(params: {
  packId: string;
  userId: string;
  rating: number;
  comment?: string;
}) {
  const rating = Math.max(1, Math.min(5, Math.round(params.rating)));

  const pack = await prisma.marketplacePack.findUnique({
    where: { id: params.packId },
  });
  if (!pack) throw new NotFoundException('Pack not found.');

  await prisma.marketplaceReview.upsert({
    where: {
      packId_userId: {
        packId: params.packId,
        userId: params.userId,
      },
    },
    update: {
      rating,
      comment: params.comment?.trim() || null,
    },
    create: {
      packId: params.packId,
      userId: params.userId,
      rating,
      comment: params.comment?.trim() || null,
    },
  });

  // Recompute average
  const allReviews = await prisma.marketplaceReview.findMany({
    where: { packId: params.packId },
    select: { rating: true },
  });

  const count = allReviews.length;
  const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
  const avg = count > 0 ? Number((sum / count).toFixed(1)) : 0;

  return prisma.marketplacePack.update({
    where: { id: params.packId },
    data: {
      ratingAvg: avg,
      reviewsCount: count,
    },
  });
}

export async function importPackIntoCourse(params: {
  packId: string;
  targetCourseId: string;
  userId: string;
  userRole?: string;
  paymentOrderId?: string;
}) {
  const [pack, course] = await Promise.all([
    prisma.marketplacePack.findUnique({ where: { id: params.packId } }),
    prisma.course.findUnique({ where: { id: params.targetCourseId } }),
  ]);

  if (!pack) throw new NotFoundException('Marketplace pack not found.');
  if (!course) throw new NotFoundException('Target course not found.');

  // Access check: only teacher of course or admin can import modules
  if (params.userRole !== 'ADMIN' && course.teacherId !== params.userId && !(await teaches(course.id, params.userId, ['CO_TEACHER']))) {
    throw new ForbiddenException('Only course instructors or administrators can import lesson packs.');
  }

  let modules: MarketplaceModule[] = [];
  try {
    modules = JSON.parse(pack.modulesData) as MarketplaceModule[];
  } catch {
    throw new BadRequestException('Malformed module bundle in marketplace pack.');
  }

  // Find last module position in target course
  const lastMod = await prisma.courseModule.findFirst({
    where: { courseId: params.targetCourseId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  let basePosition = (lastMod?.position ?? -1) + 1;

  let totalItemsImported = 0;

  // Deep-copy each module and its items
  for (const mod of modules) {
    const createdMod = await prisma.courseModule.create({
      data: {
        courseId: params.targetCourseId,
        title: mod.title,
        summary: mod.summary || null,
        position: basePosition++,
        published: true,
      },
      select: { id: true },
    });

    if (mod.items && mod.items.length > 0) {
      let itemPos = 0;
      for (const item of mod.items) {
        await prisma.moduleItem.create({
          data: {
            moduleId: createdMod.id,
            title: item.title,
            kind: item.kind || 'PAGE',
            body: item.body || null,
            url: item.url || null,
            position: itemPos++,
          },
        });
        totalItemsImported++;
      }
    }
  }

  // Record import transaction
  await prisma.marketplaceImport.create({
    data: {
      packId: params.packId,
      targetCourseId: params.targetCourseId,
      userId: params.userId,
      paymentOrderId: params.paymentOrderId || null,
    },
  });

  // Increment download count
  await prisma.marketplacePack.update({
    where: { id: params.packId },
    data: { downloadsCount: { increment: 1 } },
  });

  return {
    success: true,
    packId: params.packId,
    courseId: params.targetCourseId,
    modulesImported: modules.length,
    itemsImported: totalItemsImported,
  };
}
