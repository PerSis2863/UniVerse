import { route } from '@/server/assignments';
import { addOfficeNote, officeNotes } from '@/server/office-hours';

// A teacher's private notes about students' office hours visits (Stage 4 · 4.7).
export const GET = (req: Request) => route(req, (user) => officeNotes(user, new URL(req.url).searchParams.get('studentId') ?? ''));
export const POST = (req: Request) => route(req, async (user) => addOfficeNote(user, await req.json().catch(() => ({}))));
