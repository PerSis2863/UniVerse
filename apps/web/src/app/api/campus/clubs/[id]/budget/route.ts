import { route } from '@/server/assignments';
import { addBudgetEntry, clubBudget, deleteBudgetEntry, setClubBudget } from '@/server/club-governance';

// Stage 5 · Q17: a club's money. GET · POST { kind, amount, description, occurredAt?, receiptUrl? } · PATCH { budget } (admins) · DELETE ?entry=
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => clubBudget(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addBudgetEntry(user, (await params).id, await req.json().catch(() => ({}))));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => setClubBudget(user, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteBudgetEntry(user, (await params).id, new URL(req.url).searchParams.get('entry') ?? ''));
