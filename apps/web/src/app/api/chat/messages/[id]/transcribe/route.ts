import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { membership } from '@/lib/chat';
import { readAppFile } from '@/lib/storage';
import { route } from '@/server/assignments';
import { spendAi } from '@/server/ai-budget';
import { geminiAudioText } from '@/server/gemini';
import { BadRequestException, HttpException, NotFoundException } from '@/server/http';
import { publishChat } from '@/server/realtime';

// POST: the text of a voice message or voicemail. Made once by AI (one request), then saved on
// the message so everyone in the chat sees it without asking again.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const { id } = await params;
    const msg = await prisma.message.findUnique({ where: { id }, select: { conversationId: true, type: true, attachmentUrl: true, attachmentMime: true, metadata: true, deletedAt: true } });
    if (!msg || msg.deletedAt || !(await membership(msg.conversationId, user.id))) throw new NotFoundException('Message not found.');
    if (msg.type !== 'AUDIO' || !msg.attachmentUrl) throw new BadRequestException('Only voice messages can be transcribed.');
    const meta = (msg.metadata ?? {}) as { transcript?: string; viewOnce?: boolean };
    if (meta.viewOnce) throw new BadRequestException('View-once messages aren’t transcribed.');
    if (meta.transcript) return { transcript: meta.transcript };
    const spend = await spendAi(user);
    if (!spend.ok) throw new HttpException(spend.message, 429);
    const file = await readAppFile(msg.attachmentUrl);
    if (!file) throw new HttpException('This voice message couldn’t be read.', 422);
    const mime = (msg.attachmentMime || file.mime || 'audio/webm').split(';')[0];
    const transcript = await geminiAudioText(file.bytes, mime);
    if (!transcript) throw new HttpException('Couldn’t transcribe right now. Try again in a moment.', 503);
    await prisma.message.update({ where: { id }, data: { metadata: { ...meta, transcript: transcript.slice(0, 4000) } as Prisma.InputJsonValue } });
    publishChat(msg.conversationId);
    return { transcript };
  });
