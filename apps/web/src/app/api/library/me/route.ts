import { route } from '@/server/assignments';
import { myLibrary, myLibraryAction } from '@/server/library';

// My library (Stage 5 · B15.4). GET: loans, holds, fines. POST { action: 'hold' | 'cancel-hold' | 'renew', … }.
export const GET = (req: Request) => route(req, (user) => myLibrary(user));
export const POST = (req: Request) => route(req, async (user) => myLibraryAction(user, await req.json().catch(() => ({}))));
