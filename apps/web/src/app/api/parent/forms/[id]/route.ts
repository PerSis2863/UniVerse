import { route } from '@/server/assignments';
import { signConsentForm } from '@/server/consent-forms';

// Answer a consent form for one child (Stage 5 · B16.4). POST { studentId, answer: 'YES' | 'NO', note?, signedName, signature?, agree: true }
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => signConsentForm(user, (await params).id, await req.json().catch(() => ({}))));
