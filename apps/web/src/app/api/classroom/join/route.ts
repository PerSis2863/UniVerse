import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { joinWithCode } from '@/server/classroom';

// POST { code }: a student joins the in-person class with the code on the screen (Stage 5 · D7).
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => null)) as Body | null;
  return joinWithCode(b?.code, user, b?.position);
});
