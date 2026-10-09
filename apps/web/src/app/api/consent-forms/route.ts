import { route } from '@/server/assignments';
import { createConsentForm, staffForms } from '@/server/consent-forms';

// Consent forms, sender side (Stage 5 · B16.4; src/server/consent-forms.ts). Teachers: their classes; admins: any class or every student.
// GET: the forms I sent (admins: all) with how many answered. POST { title, body, courseId?, dueAt?, allowDecline?, attachmentUrl?, attachmentName? }: send one.
export const GET = (req: Request) => route(req, (user) => staffForms(user));
export const POST = (req: Request) => route(req, async (user) => createConsentForm(user, await req.json().catch(() => ({}))));
