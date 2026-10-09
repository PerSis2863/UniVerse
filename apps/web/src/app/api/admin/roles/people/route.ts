import { route } from '@/server/assignments';
import { findStaff } from '@/server/permissions';

// Staff accounts to add to a role (Stage 5 · B15.6). GET ?q= (name or email, 2+ characters).
export const GET = (req: Request) => route(req, (user) => findStaff(user, new URL(req.url).searchParams.get('q') ?? ''));
