'use client';

import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { homeKey } from '@/lib/bootstrap';
import { cleanLayout, EMPTY_LAYOUT, type HomeLayout, type UpNextItem } from '@/lib/home-layout';
import { useActivePoll } from '@/lib/realtime-client';

// The home pages' own data (src/server/home-data.ts) and saving the layout (Stage 5 · Q8).

export interface Attention {
  toGrade: number;
  late: number;
  missing: { id: string; title: string; code: string; due: number; missing: number }[];
  atRisk: { total: number; students: { id: string; name: string; code: string; score: number }[] };
  questions: { total: number; threads: { id: string; title: string; code: string; courseId: string; at: number }[] };
}
export interface LiveNumbers {
  attendance: { marked: number; present: number; absent: number };
  fees: { currency: string; today: number; month: number; payments: number }[];
  safety: { open: number; high: number };
  active: { now: number; today: number };
  pending: number;
}
export interface HomeData {
  layout: HomeLayout;
  upNext: UpNextItem[];
  study?: { today: number; week: { day: string; actions: number }[] };
  attention?: Attention;
  live?: LiveNumbers;
}

export function useHome(opts: { live?: boolean } = {}) {
  // The admin's live numbers refresh every minute while someone is using the tab.
  const poll = useActivePoll(opts.live ? 60_000 : 0);
  const key = homeKey();
  const swr = useSWR<HomeData>(key, authedJson, { revalidateOnFocus: true, dedupingInterval: 20_000, refreshInterval: poll });
  const layout = swr.data ? cleanLayout(swr.data.layout) : EMPTY_LAYOUT;

  const saveLayout = async (next: HomeLayout) => {
    const clean = cleanLayout(next);
    await swr.mutate((d) => (d ? { ...d, layout: clean } : d), { revalidate: false });
    try {
      await authedJson('/api/home/layout', { method: 'PUT', body: JSON.stringify(clean) });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save your home page.');
      void swr.mutate();
    }
  };
  return { ...swr, layout, saveLayout };
}
