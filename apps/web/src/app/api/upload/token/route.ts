import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionUser } from '@/lib/server-auth';

// Issues short-lived tokens so signed-in users can upload chat media straight from the browser
// to Vercel Blob (bypasses the ~4.5 MB request limit of server functions).

const CHAT_MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  // Token requests must come from a signed-in user; completion callbacks are verified by the SDK.
  let userId: string | null = null;
  if (body.type === 'blob.generate-client-token') {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });
    userId = user.id;
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!userId || !pathname.startsWith(`chat/${userId}/`)) throw new Error('Invalid upload path');
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: CHAT_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload not allowed.' }, { status: 400 });
  }
}
