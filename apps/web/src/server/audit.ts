import { getCloudflareContext } from '@opennextjs/cloudflare';
import prisma from '@/lib/db';

// Activity & audit log: records who did what (admin page: /admin/audit).

export interface AuditActor {
  id: string;
  name?: string | null;
  role?: string | null;
}

export interface AuditEntry {
  action: string; // "<area>.<verb>", e.g. "user.role_changed"
  summary: string; // shown to admins, e.g. "Changed Bob Smith's role to TEACHER"
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records an audit entry without slowing down the request: the write (and any lookups needed to
 * describe the entry, when a function is passed) runs after the response (waitUntil). Never
 * throws; a failed write is only logged.
 */
export function audit(actor: AuditActor | null, entryOrBuild: AuditEntry | (() => Promise<AuditEntry | null>), req?: Request) {
  const record = async () => {
    const entry = typeof entryOrBuild === 'function' ? await entryOrBuild() : entryOrBuild;
    if (!entry) return;
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        action: entry.action,
        summary: entry.summary.slice(0, 500),
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? undefined) as object | undefined,
        ip: req?.headers.get('cf-connecting-ip') ?? null,
      },
    });
  };
  const write = record().catch((e) => console.error('Audit log write failed:', e));
  try {
    getCloudflareContext().ctx.waitUntil(write);
  } catch {
    // not inside a Worker request (scripts): the write still runs
  }
  return write;
}
