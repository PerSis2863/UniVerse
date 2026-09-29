import type { Router } from '../router';
import { BadRequestException, PayloadTooLargeException } from '../http';
import { saveFile, uploadMime } from '@/lib/storage';

const MAX_BYTES = 10 * 1024 * 1024;

export default function filesModule(router: Router) {
  const r = router.controller('files');

  // Multipart upload (field "file"). The old API wrote to the Render server's disk, which was wiped
  // on every deploy; files now go to R2 (or the database when R2 isn't configured).
  r.post('upload', async ({ req, user }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') throw new BadRequestException('No file uploaded');
    if (file.size > MAX_BYTES) throw new PayloadTooLargeException('File too large');
    const mime = uploadMime(file.name, file.type);
    if (!mime) throw new BadRequestException('This file type can’t be uploaded.');
    const url = await saveFile({ ownerId: user.id, name: file.name, mime, bytes: Buffer.from(await file.arrayBuffer()) });
    return { url, originalName: file.name, mimeType: mime, size: file.size };
  });
}
