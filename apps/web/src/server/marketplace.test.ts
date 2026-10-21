import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '@/lib/db';
import {
  slugifyTitle,
  publishMarketplacePack,
  addMarketplaceReview,
  importPackIntoCourse,
} from './marketplace';

vi.mock('@/lib/db', () => ({
  default: {
    marketplacePack: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    marketplaceReview: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    marketplaceImport: {
      create: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
      // Not a co-teacher (src/lib/course-access.ts teaches).
      count: vi.fn().mockResolvedValue(0),
    },
    courseModule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    moduleItem: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

describe('Stage 5 · C7: Content Marketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('slugifyTitle', () => {
    it('creates URL-friendly slug with unique suffix', () => {
      const slug = slugifyTitle('Data Structures & Algorithms in C++');
      expect(slug).toMatch(/^data-structures-algorithms-in-c-[a-z0-9]{5}$/);
    });
  });

  describe('publishMarketplacePack', () => {
    it('validates minimum and maximum length bounds', async () => {
      await expect(
        publishMarketplacePack({
          authorId: 'usr-1',
          title: 'Hi',
          summary: 'Valid summary with enough text to pass the check.',
          category: 'Computer Science',
        }),
      ).rejects.toThrow('Title must be between 3 and 100 characters.');

      await expect(
        publishMarketplacePack({
          authorId: 'usr-1',
          title: 'Algorithms 101',
          summary: 'Too short',
          category: 'Computer Science',
        }),
      ).rejects.toThrow('Summary must be between 10 and 400 characters.');
    });

    it('creates published pack with modules and 80% default revenue share', async () => {
      vi.mocked(prisma.marketplacePack.create).mockResolvedValueOnce({
        id: 'pack-1',
        title: 'Operating Systems Complete',
        slug: 'operating-systems-complete-xyz12',
        revenueSharePct: 80,
      } as never);

      const res = await publishMarketplacePack({
        authorId: 'usr-1',
        title: 'Operating Systems Complete',
        summary: 'Comprehensive 12-week curriculum on processes, memory, and file systems.',
        category: 'Computer Science',
        level: 'INTERMEDIATE',
        priceMinor: 49900,
        modulesData: [
          {
            title: 'Week 1: Virtual Memory',
            summary: 'Paging and segmentation.',
            position: 0,
            items: [
              { title: 'Lecture Notes', kind: 'PAGE', body: 'Notes text', position: 0 },
            ],
          },
        ],
      });

      expect(res.id).toBe('pack-1');
      expect(prisma.marketplacePack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'usr-1',
            priceMinor: 49900,
            modulesCount: 1,
            itemsCount: 1,
            revenueSharePct: 80,
          }),
        }),
      );
    });
  });

  describe('addMarketplaceReview', () => {
    it('clamps rating to 1..5 range and recalculates average rating', async () => {
      vi.mocked(prisma.marketplacePack.findUnique).mockResolvedValueOnce({
        id: 'pack-1',
      } as never);
      vi.mocked(prisma.marketplaceReview.upsert).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.marketplaceReview.findMany).mockResolvedValueOnce([
        { rating: 5 },
        { rating: 4 },
      ] as never);
      vi.mocked(prisma.marketplacePack.update).mockResolvedValueOnce({
        id: 'pack-1',
        ratingAvg: 4.5,
        reviewsCount: 2,
      } as never);

      const res = await addMarketplaceReview({
        packId: 'pack-1',
        userId: 'usr-2',
        rating: 6, // Should be clamped to 5
        comment: 'Outstanding curriculum!',
      });

      expect(res.ratingAvg).toBe(4.5);
      expect(prisma.marketplacePack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pack-1' },
          data: { ratingAvg: 4.5, reviewsCount: 2 },
        }),
      );
    });
  });

  describe('importPackIntoCourse', () => {
    it('enforces instructor or admin permission on target course', async () => {
      vi.mocked(prisma.marketplacePack.findUnique).mockResolvedValueOnce({
        id: 'pack-1',
        status: 'PUBLISHED',
        priceMinor: 0,
        modulesData: '[]',
      } as never);
      vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({
        id: 'crs-1',
        teacherId: 'teacher-different',
      } as never);

      await expect(
        importPackIntoCourse({
          packId: 'pack-1',
          targetCourseId: 'crs-1',
          userId: 'random-user',
          userRole: 'TEACHER',
        }),
      ).rejects.toThrow('Only course instructors or administrators can import lesson packs.');
    });

    it('refuses a paid pack to anyone but its author (buying packs does not exist yet)', async () => {
      const paid = { id: 'pack-2', status: 'PUBLISHED', priceMinor: 49900, authorId: 'author-1', modulesData: '[]' };
      vi.mocked(prisma.marketplacePack.findUnique).mockResolvedValueOnce(paid as never);
      vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: 'crs-1', teacherId: 'teacher-1' } as never);
      await expect(importPackIntoCourse({ packId: 'pack-2', targetCourseId: 'crs-1', userId: 'teacher-1', userRole: 'TEACHER', paymentOrderId: 'made-up' }))
        .rejects.toThrow('Paid packs can’t be imported yet');
    });

    it('hides packs that are not published', async () => {
      vi.mocked(prisma.marketplacePack.findUnique).mockResolvedValueOnce({ id: 'pack-3', status: 'HIDDEN', priceMinor: 0, modulesData: '[]' } as never);
      vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({ id: 'crs-1', teacherId: 'teacher-1' } as never);
      await expect(importPackIntoCourse({ packId: 'pack-3', targetCourseId: 'crs-1', userId: 'teacher-1', userRole: 'TEACHER' })).rejects.toThrow('Marketplace pack not found.');
    });

    it('deep-copies modules and items and increments download counter', async () => {
      const sampleModules = [
        {
          title: 'Module A',
          summary: 'Summary A',
          position: 0,
          items: [
            { title: 'Item 1', kind: 'PAGE', body: 'Page 1 text', position: 0 },
            { title: 'Item 2', kind: 'LINK', url: 'https://docs.edu', position: 1 },
          ],
        },
      ];

      vi.mocked(prisma.marketplacePack.findUnique).mockResolvedValueOnce({
        id: 'pack-1',
        status: 'PUBLISHED',
        priceMinor: 0,
        modulesData: JSON.stringify(sampleModules),
      } as never);
      vi.mocked(prisma.course.findUnique).mockResolvedValueOnce({
        id: 'crs-1',
        teacherId: 'teacher-1',
      } as never);
      vi.mocked(prisma.courseModule.findFirst).mockResolvedValueOnce({
        position: 3,
      } as never);
      vi.mocked(prisma.courseModule.create).mockResolvedValueOnce({
        id: 'new-mod-1',
      } as never);
      vi.mocked(prisma.moduleItem.create).mockResolvedValue({} as never);
      vi.mocked(prisma.marketplaceImport.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.marketplacePack.update).mockResolvedValueOnce({} as never);

      const res = await importPackIntoCourse({
        packId: 'pack-1',
        targetCourseId: 'crs-1',
        userId: 'teacher-1',
        userRole: 'TEACHER',
      });

      expect(res.success).toBe(true);
      expect(res.modulesImported).toBe(1);
      expect(res.itemsImported).toBe(2);
      // Two inserts for the whole pack (D1 answers 50 queries a request).
      const mods = vi.mocked(prisma.courseModule.createMany).mock.calls[0][0] as { data: { id: string; courseId: string; title: string; position: number }[] };
      expect(mods.data).toEqual([expect.objectContaining({ courseId: 'crs-1', title: 'Module A', position: 4 })]); // after existing position 3
      const items = vi.mocked(prisma.moduleItem.createMany).mock.calls[0][0] as { data: { moduleId: string; title: string; kind: string; url: string | null }[] };
      expect(items.data.map((i) => [i.moduleId, i.title, i.kind])).toEqual([[mods.data[0].id, 'Item 1', 'PAGE'], [mods.data[0].id, 'Item 2', 'LINK']]);
      expect(prisma.moduleItem.create).not.toHaveBeenCalled();
      expect(prisma.marketplacePack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pack-1' },
          data: { downloadsCount: { increment: 1 } },
        }),
      );
    });
  });
});
