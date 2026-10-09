import { publicRoute } from '@/server/public-route';
import { BadRequestException } from '@/server/http';
import { publicRound, submitApplication } from '@/server/admissions';

// The public application form (Stage 5 · B15.1): no sign-in. GET: the form. POST (multipart): apply.
export const GET = async (_req: Request, { params }: { params: Promise<{ slug: string }> }) => publicRoute(async () => publicRound((await params).slug));
export const POST = async (req: Request, { params }: { params: Promise<{ slug: string }> }) => publicRoute(async () => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new BadRequestException('The form didn’t arrive properly. Please try again.');
  return submitApplication((await params).slug, form, req.headers.get('cf-connecting-ip'));
});
