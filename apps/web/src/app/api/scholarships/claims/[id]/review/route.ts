import { route } from '@/server/assignments';
import { reviewScholarshipClaim } from '@/server/impact-scholarships';

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    const body = (await req.json()) as { decision: 'APPROVED' | 'REJECTED'; rejectionReason?: string };
    return reviewScholarshipClaim((await params).id, body.decision, body.rejectionReason, user);
  });
