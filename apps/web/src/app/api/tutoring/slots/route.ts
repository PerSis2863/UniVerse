import { route } from '@/server/assignments';
import prisma from '@/lib/db';
import { addTutorSlots, deleteTutorSlot, type AddSlotInput } from '@/server/peer-tutoring';

export const GET = (req: Request) =>
  route(req, async () => {
    const url = new URL(req.url);
    const tutorId = url.searchParams.get('tutorId');
    if (!tutorId) return [];

    const slots = await prisma.peerTutorSlot.findMany({
      where: { tutorId, isBooked: false },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return slots;
  });

export const POST = (req: Request) =>
  route(req, async (user) => {
    const body = (await req.json()) as { slots: AddSlotInput[] };
    return addTutorSlots(user.id, body.slots ?? []);
  });

export const DELETE = (req: Request) =>
  route(req, async (user) => {
    const url = new URL(req.url);
    const slotId = url.searchParams.get('slotId');
    if (!slotId) return { error: 'slotId is required' };
    return deleteTutorSlot(user.id, slotId);
  });
