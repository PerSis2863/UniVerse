import type { Router } from '../router';
import prisma from '@/lib/db';
import { warmFirebaseKeys } from '../auth';

export default function healthModule(router: Router) {
  const r = router.controller('health', { public: true });

  // Also used as a warm-up call from the sign-in pages: starts the Worker, the database client and
  // fetches Google's keys while the user is still typing.
  r.get('', async () => {
    try {
      await Promise.all([prisma.$queryRawUnsafe('SELECT 1'), warmFirebaseKeys()]);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'error', database: 'disconnected', details: (error as Error).message };
    }
  });
}
