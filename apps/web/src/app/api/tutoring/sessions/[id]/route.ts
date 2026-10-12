import { route } from '@/server/assignments';
import prisma from '@/lib/db';
import { cancelTutoringSession } from '@/server/peer-tutoring';

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id } = await params;
    const session = await prisma.peerTutoringSession.findUnique({
      where: { id },
      include: {
        tutor: { select: { id: true, name: true, email: true, avatar: true } },
        learner: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, name: true, code: true } },
      },
    });
    if (!session) return { error: 'Session not found' };
    return session;
  });

export const DELETE = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const { id } = await params;
    const url = new URL(req.url);
    const reason = url.searchParams.get('reason') ?? undefined;
    return cancelTutoringSession(id, user.id, reason);
  });
