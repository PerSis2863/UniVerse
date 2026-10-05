'use client';

import { use, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCalls } from '@/store/calls';

// A UniVerse voice or video call. The call itself runs in CallHost (root layout), so it keeps going
// while you use the rest of the app (minimised to a floating bar). This page just opens it full
// screen. Group and class rooms take ?kind=audio|video; chat calls know their own kind.
export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const kind = useSearchParams().get('kind');
  useEffect(() => {
    useCalls.getState().open(id, kind === 'audio' ? 'audio' : kind === 'video' ? 'video' : undefined);
  }, [id, kind]);
  // The call's own screen covers this; the backdrop shows for the moment it takes to load.
  return <div className="fixed inset-0 bg-[#0b0e1a]" aria-hidden />;
}
