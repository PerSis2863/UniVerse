import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { hasR2Storage, r2PresignPut } from '@/lib/r2';

// Issues short-lived signed URLs so signed-in users can upload chat media straight from the browser
// to Cloudflare R2 (bypasses the request-size limit for files sent through the server).

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

// Browsers leave file.type empty for some files; fall back to the extension.
const TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export async function POST(request: Request) {
  if (!hasR2Storage()) {
    return NextResponse.json({ error: 'File uploads are not set up yet (storage is not connected).' }, { status: 503 });
  }
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });

  const { filename, contentType, size } = await request.json().catch(() => ({}));
  if (typeof filename !== 'string' || !filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
  const sent = typeof contentType === 'string' ? contentType.split(';')[0].trim() : '';
  const type = sent || TYPE_BY_EXT[filename.split('.').pop()?.toLowerCase() ?? ''] || '';
  if (!ALLOWED_TYPES.includes(type)) return NextResponse.json({ error: 'This file type is not allowed.' }, { status: 400 });
  if (!Number.isInteger(size) || size <= 0 || size > CHAT_MAX_BYTES) {
    return NextResponse.json({ error: 'Files must be 25 MB or smaller.' }, { status: 413 });
  }

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';
  const key = `chat/${user.id}/${randomBytes(12).toString('base64url')}/${safe}`;
  const { uploadUrl, publicUrl } = await r2PresignPut(key, type, size);
  return NextResponse.json({ uploadUrl, url: publicUrl, contentType: type });
}
