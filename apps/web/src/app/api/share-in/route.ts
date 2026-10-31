import { text } from '@/server/body';

// "Share to UniVerse" (manifest share_target, M43): Android posts what was shared here. The service
// worker (src/worker/index.ts) answers it on the device and keeps the photos; this runs only when it
// isn't there yet, so the title, text and link still reach the app (photos can't wait here).
export async function POST(req: Request) {
  const q = new URLSearchParams();
  const form = await req.formData().catch(() => null);
  for (const k of ['title', 'text', 'url']) {
    const v = text(form?.get(k)).trim().slice(0, 2000);
    if (v) q.set(k, v);
  }
  return new Response(null, { status: 303, headers: { Location: `/app?${q}`, 'Cache-Control': 'no-store' } });
}
