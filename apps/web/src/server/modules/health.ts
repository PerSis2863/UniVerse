import type { Router } from '../router';
import prisma from '@/lib/db';

export default function healthModule(router: Router) {
  const r = router.controller('health', { public: true });

  r.get('', async () => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      return { status: 'error', database: 'disconnected', details: (error as Error).message };
    }
  });
}
