import { route } from '@/server/assignments';
import { listPeerTutors, upsertTutorProfile, type UpsertTutorProfileInput } from '@/server/peer-tutoring';

export const GET = (req: Request) =>
  route(req, async () => {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') ?? undefined;
    const subject = url.searchParams.get('subject') ?? undefined;
    const courseId = url.searchParams.get('courseId') ?? undefined;
    const onlyD1Verified = url.searchParams.get('onlyD1Verified') === 'true';
    const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : undefined;
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;

    return listPeerTutors({
      search,
      subject,
      courseId,
      onlyD1Verified,
      page,
      limit,
    });
  });

export const POST = (req: Request) =>
  route(req, async (user) => {
    const body = (await req.json()) as UpsertTutorProfileInput;
    return upsertTutorProfile(user.id, body);
  });
