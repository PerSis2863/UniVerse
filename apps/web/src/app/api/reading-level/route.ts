import { route } from '@/server/assignments';
import { editLevel, levelItems, resetLevel } from '@/server/reading-level';

// Reading levels (Stage 5 · D9). POST { items: [{ kind, id }], level: 'g8' | 'g5', to? }: course
// material sections, assignment instructions, feedback, announcements and quiz questions rewritten
// for a reading level, with key terms explained. PUT { kind, id, level, to?, text, terms }: the
// teacher's corrected version. DELETE ?kind&id&level&to: back to the AI's version.
const body = async (req: Request) => (await req.json().catch(() => ({}))) as Record<string, unknown>;
export const POST = (req: Request) => route(req, async (user) => levelItems(user, await body(req)));
export const PUT = (req: Request) => route(req, async (user) => editLevel(user, await body(req)));
export const DELETE = (req: Request) => route(req, async (user) => resetLevel(user, Object.fromEntries(new URL(req.url).searchParams)));
