import { Suspense } from 'react';
import { CallOpener } from './CallOpener';

// A UniVerse voice or video call. The call itself runs in CallHost (root layout), so it keeps going
// while you use the rest of the app (minimised to a floating bar). This page just opens it full
// screen. Group and class rooms take ?kind=audio|video; chat calls know their own kind.
//
// Built ahead of time once, as /call/open, and the Worker answers every /call/<id> with that page
// (cloudflare/worker.ts): rendering it per call started the whole Next.js server on a fresh Worker,
// ~1 s of CPU against Workers Free's 10 ms, and Cloudflare showed "Error 1101" instead of the call.
export function generateStaticParams() {
  return [{ id: 'open' }];
}

export default function CallPage() {
  // The call's own screen covers this; the backdrop shows for the moment it takes to load.
  return (
    <>
      <div className="fixed inset-0 bg-black" aria-hidden />
      <Suspense fallback={null}><CallOpener /></Suspense>
    </>
  );
}
