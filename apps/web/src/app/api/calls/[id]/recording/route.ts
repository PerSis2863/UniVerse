import { route } from '@/server/assignments';
import { recordingUploadUrl, saveRecording } from '@/server/call-recordings';

// POST { step: 'upload', contentType, size } → { uploadUrl, url }: where the teacher's browser
// uploads a class call's recording. POST { step: 'save', url, size, durationSec } → the material.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const id = (await params).id;
    const body = await req.json().catch(() => ({}));
    return body.step === 'save' ? saveRecording(id, user, body) : recordingUploadUrl(id, user, body);
  });
