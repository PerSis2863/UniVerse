import { assignmentDetail, deleteAssignment, route, updateAssignment } from '@/server/assignments';

type Ctx = { params: Promise<{ id: string }> };

// GET: the assignment (teachers: with every submission; students: with their own).
// PATCH: edit, close or reopen. DELETE: remove it (grades already returned stay in Grades).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => assignmentDetail((await params).id, user));

export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateAssignment((await params).id, user, await req.json().catch(() => ({}))));

export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteAssignment((await params).id, user, req));
