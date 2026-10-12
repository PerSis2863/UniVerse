import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { claimScholarship, type ClaimScholarshipInput } from '@/server/impact-scholarships';

export const GET = (req: Request) =>
  route(req, async (user) => {
    return prisma.impactScholarshipClaim.findMany({
      where: user.role === 'ADMIN' ? {} : { studentId: user.id },
      include: {
        pool: { select: { title: true, sponsorName: true, sponsorType: true } },
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

export const POST = (req: Request) =>
  route(req, async (user) => {
    const body = (await req.json()) as ClaimScholarshipInput;
    return claimScholarship(body, user);
  });
