import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { roleAction } from '@/server/permissions';

// One custom role (Stage 5 · B15.6). POST { action: 'save' | 'delete' | 'add' | 'remove', … }.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => {
  const id = (await params).id;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await roleAction(user, id, b) as Record<string, unknown>;
  const summary = b.action === 'add' ? `Gave ${String(out.added)} the role “${String(out.role)}”`
    : b.action === 'remove' ? `Took the role “${String(out.role)}” from ${String(out.removed)}`
    : b.action === 'delete' ? `Deleted the role “${String(out.name)}”` : `Changed the role “${String(out.name)}”`;
  audit(user, { action: `roles.${String(b.action)}`, summary, targetType: 'staff-role', targetId: id }, req);
  return out;
});
