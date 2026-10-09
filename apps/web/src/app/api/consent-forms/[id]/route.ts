import { route } from '@/server/assignments';
import { consentFormAction, consentFormDetail } from '@/server/consent-forms';

// One consent form (Stage 5 · B16.4). GET: every student and their answer. POST { action: 'remind' | 'close' | 'reopen' }.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => consentFormDetail(user, (await params).id));
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => consentFormAction(user, (await params).id, await req.json().catch(() => ({}))));
