'use client';

import { use } from 'react';
import { HallView } from '@/components/hall/HallView';

// A class's or study group's Study Hall (Stage 4 · 4.2): /hall/hc_<course> or /hall/hg_<group>.
export default function HallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <HallView hallId={id} />;
}
