import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { saveFile, SERVER_UPLOAD_MAX } from '@/lib/storage';

// Upload a file (raw request body, ?filename=...). Stored in Cloudflare R2 when configured,
// otherwise in the database. Returns { url }.

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });

    const filename = new URL(request.url).searchParams.get('filename');
    if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });

    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    const extMime = MIME_BY_EXT[ext];
    if (!extMime) return NextResponse.json({ error: 'This file type can’t be uploaded.' }, { status: 400 });
    // Voice notes recorded as .webm/.mp4 may be video containers holding audio; keep the browser's type when it matches the family.
    const sent = request.headers.get('content-type') ?? '';
    const mime = sent && sent.split('/')[0] === extMime.split('/')[0] ? sent.split(';')[0] : extMime;

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > SERVER_UPLOAD_MAX) return NextResponse.json({ error: 'Files must be 4 MB or smaller.' }, { status: 413 });

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });
    if (bytes.length > SERVER_UPLOAD_MAX) return NextResponse.json({ error: 'Files must be 4 MB or smaller.' }, { status: 413 });

    const url = await saveFile({ ownerId: user.id, name: filename, mime, bytes });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
