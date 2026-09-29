import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { saveFile, SERVER_UPLOAD_MAX, uploadMime } from '@/lib/storage';

// Upload a file (raw request body, ?filename=...). Stored in Cloudflare R2 when configured,
// otherwise in the database. Returns { url }.

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });

    const filename = new URL(request.url).searchParams.get('filename');
    if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });

    const mime = uploadMime(filename, request.headers.get('content-type'));
    if (!mime) return NextResponse.json({ error: 'This file type can’t be uploaded.' }, { status: 400 });

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
