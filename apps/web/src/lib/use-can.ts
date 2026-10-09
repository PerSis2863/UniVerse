'use client';

import { useAuthStore } from '@/store/auth';
import { userCan, type Permission } from './permissions';

/** Whether the signed-in person may do something (Stage 5 · B15.6): to hide buttons they can't use. The server checks again. */
export function useCan(p: Permission) {
  const user = useAuthStore((s) => s.user);
  return userCan(user, p);
}
