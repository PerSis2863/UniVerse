import { route } from '@/server/assignments';
import { BadRequestException } from '@/server/http';
import { getSpace } from '@/server/spaces';

// GET: one space (a course or a study group): its call, documents, task boards, code rooms, people.
export const GET = (req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) => route(req, async (user) => {
  const { kind, id } = await params;
  if (kind !== 'course' && kind !== 'group') throw new BadRequestException('Unknown kind of space.');
  return getSpace(kind, id, user);
});
