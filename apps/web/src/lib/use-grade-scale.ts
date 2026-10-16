'use client';

import useSWR from 'swr';
import { authedJson } from './authed-fetch';
import { DEFAULT_SCALE, type Scale } from './gradebook';

// The signed-in person's school letter grades (Stage 5 · B3.4, GET /api/grade-scale); the default A–F
// until it loads, or if it can't.
export function useGradeScale(): Scale {
  const { data } = useSWR<{ scale: Scale }>('/api/grade-scale', authedJson, { revalidateOnFocus: false });
  return data?.scale?.length ? data.scale : DEFAULT_SCALE;
}
