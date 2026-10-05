import prisma from '@/lib/db';
import { getSystemUser, membership, visibleTo } from '@/lib/chat';
import { route } from '@/server/assignments';
import { spendAi } from '@/server/ai-budget';
import { geminiJson, geminiText } from '@/server/gemini';
import { BadRequestException, HttpException, NotFoundException } from '@/server/http';
import { featureOff } from '@/server/moderation';
import { publishChat } from '@/server/realtime';

// AI in a chat (one request each, counted against the daily AI limits):
//   ask      "/ask …": answered in the chat for everyone, from the recent conversation.
//   catchup  what you missed since you last read the chat, just for you (not saved).
//   replies  three short replies you could send to the latest messages, just for you.

type Line = { who: string; text: string };

async function recent(conversationId: string, userId: string, opts: { since?: Date | null; take: number }) {
  const rows = await prisma.message.findMany({
    where: { conversationId, deletedAt: null, type: { in: ['TEXT', 'POLL'] }, threadId: null, ...visibleTo(userId), ...(opts.since ? { createdAt: { gt: opts.since } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.take,
    select: { body: true, senderId: true, sender: { select: { name: true } } },
  });
  return rows.reverse().map((m): Line => ({ who: m.senderId === userId ? 'Me' : m.sender.name.split(' ')[0], text: m.body.slice(0, 600) }));
}
const transcript = (lines: Line[]) => lines.map((l) => `${l.who}: ${l.text}`).join('\n').slice(-12_000);

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    const { id } = await params;
    const me = await membership(id, user.id);
    if (!me) throw new NotFoundException('Conversation not found.');
    if (await featureOff('ai')) throw new HttpException('AI features are turned off on UniVerse for now.', 503);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? '');

    if (action === 'catchup') {
      const lines = await recent(id, user.id, { since: me.lastReadAt ? new Date(me.lastReadAt.getTime() - 1) : null, take: 200 });
      const others = lines.filter((l) => l.who !== 'Me');
      if (others.length < 3) return { summary: null, count: others.length };
      const spend = await spendAi(user);
      if (!spend.ok) throw new HttpException(spend.message, 429);
      const summary = await geminiText(
        'You summarise a group chat for a student or teacher who missed it. Write 2–5 short bullet points ("- ") with what matters: decisions, questions for them, dates, tasks, links mentioned. Use the chat\'s language. No preamble.',
        transcript(lines), 400,
      );
      if (!summary) throw new HttpException('Couldn’t summarise right now. Try again in a moment.', 503);
      return { summary, count: others.length };
    }

    if (action === 'replies') {
      const lines = await recent(id, user.id, { take: 12 });
      if (!lines.some((l) => l.who !== 'Me')) return { replies: [] };
      const spend = await spendAi(user);
      if (!spend.ok) throw new HttpException(spend.message, 429);
      const out = await geminiJson<{ replies: string[] }>(
        'Suggest three short, natural replies (under 12 words each) that "Me" could send next in this chat, in the language "Me" uses. Vary them: e.g. agree, ask, decline politely.',
        transcript(lines), { type: 'object', properties: { replies: { type: 'array', items: { type: 'string' } } }, required: ['replies'] }, 200, true,
      );
      return { replies: (out?.replies ?? []).map((r) => r.slice(0, 120)).slice(0, 3) };
    }

    if (action === 'ask') {
      const question = String(b.question ?? '').trim().slice(0, 500);
      if (!question) throw new BadRequestException('Type a question after /ask.');
      if (await featureOff('chat')) throw new HttpException('Sending messages is turned off on UniVerse for now.', 503);
      const spend = await spendAi(user);
      if (!spend.ok) throw new HttpException(spend.message, 429);
      const lines = await recent(id, user.id, { take: 20 });
      const answer = await geminiText(
        'You are UniVerse AI, a helpful study assistant inside a university chat. Answer the question clearly and briefly (under 150 words), using the recent chat for context when relevant. If it is about facts you are unsure of, say so. Use the question\'s language.',
        `Recent chat:\n${transcript(lines)}\n\nQuestion from ${user.name.split(' ')[0]}: ${question}`, 500,
      );
      if (!answer) throw new HttpException('Couldn’t answer right now. Try again in a moment.', 503);
      const system = await getSystemUser();
      const msg = await prisma.message.create({ data: { conversationId: id, senderId: system.id, type: 'TEXT', body: answer.slice(0, 4000), metadata: { ai: true, askedBy: user.name, question } } });
      await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      publishChat(id);
      return { id: msg.id };
    }
    throw new BadRequestException('Unknown AI action.');
  });
