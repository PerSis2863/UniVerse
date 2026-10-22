import prisma from '@/lib/db';
import { route } from '@/server/assignments';
import { claimScholarship, type ClaimScholarshipInput } from '@/server/impact-scholarships';
import { schoolsOf, usersIn } from '@/server/school-scope';

export const GET = (req: Request) =>
  route(req, async (user) => {
    return prisma.impactScholarshipClaim.findMany({
      // Admins: their own school's students' claims (school-scope.ts).
      where: user.role === 'ADMIN' ? { student: usersIn(await schoolsOf(user)) } : { studentId: user.id },
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
