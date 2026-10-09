import { route } from '@/server/assignments';
import { parentForms } from '@/server/consent-forms';

// Consent forms, parent side (Stage 5 · B16.4; src/server/consent-forms.ts). GET: forms for my children, with each child's answer.
export const GET = (req: Request) => route(req, (user) => parentForms(user));
