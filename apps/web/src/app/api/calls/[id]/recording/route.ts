import { route } from '@/server/assignments';
import { checkRecording, recordingUploadUrl, saveRecording } from '@/server/call-recordings';

// POST { step: 'check' } before recording starts: may I record, and can it be saved?
// POST { step: 'upload', contentType, size } → { uploadUrl, url }: where the browser uploads it.
// POST { step: 'save', url, size, durationSec, contentType } → saved where the call happened
// (a class's materials, the chat, the group, or Calls). See src/server/call-recordings.ts.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const id = (await params).id;
    const body = await req.json().catch(() => ({}));
    return body.step === 'check' ? checkRecording(id, user) : body.step === 'save' ? saveRecording(id, user, body) : recordingUploadUrl(id, user, body);
  });
