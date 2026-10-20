import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { addSlots, bookSlot, cancelBooking, deleteSlot, myMentoring, saveMentorProfile } from '@/server/careers';

// Stage 5 · Q15: my mentor profile, the times I offer, and my bookings (as a student and as a mentor).
// GET · POST { action: 'profile' | 'slots' | 'book' | 'cancel', … } · DELETE ?slot=

export const GET = (req: Request) => route(req, (user) => myMentoring(user));
export const POST = (req: Request) => route(req, async (user) => {
  const b = await req.json().catch(() => ({}));
  if (b.action === 'profile') return saveMentorProfile(user, b);
  if (b.action === 'slots') return addSlots(user, b);
  if (b.action === 'book') return bookSlot(user, b);
  if (b.action === 'cancel') return cancelBooking(user, b);
  throw new BadRequestException('Unknown action.');
});
export const DELETE = (req: Request) => route(req, (user) => deleteSlot(user, new URL(req.url).searchParams.get('slot') ?? ''));
