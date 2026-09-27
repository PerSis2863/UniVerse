import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'File uploads are not set up yet (storage is not connected).' }, { status: 503 });
    }
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to upload files.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Basic MIME type check from extension
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // Size limit check (e.g., 5MB)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 413 });
    }

    if (!request.body) {
      return NextResponse.json({ error: 'Request body is required' }, { status: 400 });
    }

    // Keep files per user and add a random suffix so uploads never overwrite each other.
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const blob = await put(`uploads/${user.id}/${safeName}`, request.body, {
      access: 'public',
      addRandomSuffix: true,
    });

    return NextResponse.json(blob);
  } catch (error) {
    console.error('Error uploading to Vercel Blob:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
