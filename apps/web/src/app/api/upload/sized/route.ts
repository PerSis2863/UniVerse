import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';
import { savePhotoSizes, SERVER_UPLOAD_MAX, uploadMime } from '@/lib/storage';

// Upload a photo in its sizes (Stage 5 · A4): multipart form with one part per width ("w320",
// "w960", "w1920"), all the same picture type, made in the browser (src/lib/photo-sizes.ts);
// ?filename=... Returns { url } of the largest, whose address says which sizes there are
// (src/lib/image-sizes.ts). Everyone who sees the photo then downloads only the size they need.

const PHOTO = /^image\/(webp|jpeg|png)$/;

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });

    const filename = new URL(request.url).searchParams.get('filename');
    if (!filename) return NextResponse.json({ error: 'Filename is required' }, { status: 400 });

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > SERVER_UPLOAD_MAX + 64 * 1024) return NextResponse.json({ error: 'Files must be 4 MB or smaller.' }, { status: 413 });

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Send the photo’s sizes as a form.' }, { status: 400 });
    const parts: { width: number; file: Blob }[] = [];
    for (const [name, value] of form.entries()) {
      const m = /^w(\d{1,4})$/.exec(name);
      if (!m || typeof value === 'string') return NextResponse.json({ error: 'Unexpected part in the form.' }, { status: 400 });
      parts.push({ width: Number(m[1]), file: value });
    }
    parts.sort((a, b) => a.width - b.width);
    if (parts.length < 2 || parts.length > 4 || parts.some((p, i) => p.width < 16 || p.width > 4096 || (i > 0 && p.width <= parts[i - 1].width))) {
      return NextResponse.json({ error: 'A photo needs 2 to 4 different sizes.' }, { status: 400 });
    }
    const type = parts[0].file.type;
    const mime = uploadMime(filename, type);
    if (!PHOTO.test(type) || mime !== type || parts.some((p) => p.file.type !== type)) {
      return NextResponse.json({ error: 'Only photos (WebP, JPEG or PNG) can be uploaded in sizes.' }, { status: 400 });
    }
    const total = parts.reduce((n, p) => n + p.file.size, 0);
    if (parts.some((p) => p.file.size === 0)) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });
    if (total > SERVER_UPLOAD_MAX) return NextResponse.json({ error: 'Files must be 4 MB or smaller.' }, { status: 413 });

    const sizes = await Promise.all(parts.map(async (p) => ({ width: p.width, bytes: new Uint8Array(await p.file.arrayBuffer()) })));
    const url = await savePhotoSizes({ ownerId: user.id, name: filename, mime, sizes });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
