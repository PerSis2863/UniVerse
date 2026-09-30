import type { Router } from '../router';
import prisma from '@/lib/db';
import { BadRequestException } from '../http';

// Pages opened and buttons / links clicked, sent in batches by the app (see lib/activity-tracker.ts)
// and shown in the owner console's activity feed. Never what people type.

const MAX_BATCH = 200;
const MAX_AGE_MS = 24 * 60 * 60_000; // older batches (a tab left offline for days) are dropped

export default function activityModule(router: Router) {
  const r = router.controller('activity');

  r.post('ui', async ({ user, body }) => {
    const events: unknown[] = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
    if (!events.length) throw new BadRequestException('No events');
    const now = Date.now();
    const data = events.flatMap((e) => {
      const { k, l, p, t } = (e ?? {}) as { k?: unknown; l?: unknown; p?: unknown; t?: unknown };
      if ((k !== 'VIEW' && k !== 'CLICK') || typeof p !== 'string' || typeof t !== 'number' || t > now + 60_000 || t < now - MAX_AGE_MS) return [];
      return [{ userId: user.id, kind: k, path: p.slice(0, 200), label: typeof l === 'string' && l.trim() ? l.trim().slice(0, 120) : null, createdAt: new Date(Math.min(t, now)) }];
    });
    if (data.length) await prisma.uiEvent.createMany({ data });
    return { saved: data.length };
  });
}
