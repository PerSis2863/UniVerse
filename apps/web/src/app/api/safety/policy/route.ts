import { route } from '@/server/assignments';
import { policyView, setSchoolPolicy } from '@/server/safety';

// The school's safety policy (Stage 4 · 4.10; src/server/safety.ts): school admins only.
export const GET = (req: Request) => route(req, (user) => policyView(user));
export const POST = (req: Request) => route(req, async (user) => setSchoolPolicy(user, await req.json().catch(() => ({}))));
