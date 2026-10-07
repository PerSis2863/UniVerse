import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { boardAccess, canEdit } from './boards';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';

// AI on boards (Stage 4 · 3.5): one AI request per action. The board's app sends the text on the
// board (sticky notes, labels) and draws what comes back, so the server never touches the drawing:
//   themes   sticky notes → 2–6 themes, each with the notes that belong to it
//   mindmap  a topic → a mind map (centre, 3–6 branches, up to 4 ideas each)
//   summary  "summarise this board" → a title, a few sentences and next steps

const THEMES = { type: 'OBJECT', properties: { themes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, notes: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['name', 'notes'] } } }, required: ['themes'] };
const MINDMAP = { type: 'OBJECT', properties: { center: { type: 'STRING' }, branches: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, ideas: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['label', 'ideas'] } } }, required: ['center', 'branches'] };
const SUMMARY = { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, nextSteps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'summary', 'nextSteps'] };

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

/** POST /api/boards/:id/ai { action, texts?, topic? } */
export async function boardAi(boardId: string, user: SessionUser, b: Record<string, unknown>) {
  const access = await boardAccess(boardId, user.id);
  if (!access) throw new NotFoundException('This board doesn’t exist or hasn’t been shared with you.');
  const action = b.action === 'themes' || b.action === 'mindmap' || b.action === 'summary' ? b.action : null;
  if (!action) throw new BadRequestException('Unknown action.');
  // Grouping and mind maps add to the board; a summary only reads it.
  if (action !== 'summary' && !canEdit(access.role)) throw new ForbiddenException('You can only look at this board.');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now.', 503);
  const texts = Array.isArray(b.texts) ? (b.texts as unknown[]).map((t) => clip(t, 300)).filter(Boolean).slice(0, 150) : [];
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message || 'You’ve used today’s AI allowance.', 429);

  if (action === 'themes') {
    if (texts.length < 3) throw new BadRequestException('Add at least 3 sticky notes first.');
    const list = texts.map((t, i) => `${i}. ${t}`).join('\n');
    const out = await geminiJson<{ themes: { name: string; notes: number[] }[] }>(
      'You group sticky notes from a class workshop into themes. 2 to 6 themes, each with a short name (2–4 words). Every note goes in exactly one theme; use the note numbers given. Keep the language of the notes.',
      `Board: ${access.board.title}\nNotes:\n${list}`, THEMES, 1500, true,
    );
    if (!out?.themes?.length) throw new HttpException('The AI didn’t answer. Please try again.', 502);
    const seen = new Set<number>();
    const themes = out.themes.slice(0, 6).map((t) => ({ name: clip(t.name, 40) || 'Theme', notes: (t.notes ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < texts.length && !seen.has(n) && (seen.add(n), true)) })).filter((t) => t.notes.length);
    const left = texts.map((_, i) => i).filter((i) => !seen.has(i));
    if (left.length) themes.push({ name: 'Other', notes: left });
    return { themes };
  }
  if (action === 'mindmap') {
    const topic = clip(b.topic, 200);
    if (!topic) throw new BadRequestException('What should the mind map be about?');
    const out = await geminiJson<{ center: string; branches: { label: string; ideas: string[] }[] }>(
      'You make a mind map for students. A short centre (the topic), 3 to 6 branches with short labels (1–4 words), each with up to 4 short ideas (2–6 words). Write in the language of the topic.',
      `Topic: ${topic}${texts.length ? `\nAlready on the board:\n${texts.slice(0, 40).join('\n')}` : ''}`, MINDMAP, 1200, true,
    );
    if (!out?.branches?.length) throw new HttpException('The AI didn’t answer. Please try again.', 502);
    return { center: clip(out.center, 60) || topic.slice(0, 60), branches: out.branches.slice(0, 6).map((br) => ({ label: clip(br.label, 40), ideas: (br.ideas ?? []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 4) })).filter((br) => br.label) };
  }
  if (!texts.length) throw new BadRequestException('There’s no text on this board to summarise yet.');
  const out = await geminiJson<{ title: string; summary: string; nextSteps: string[] }>(
    'You summarise a whiteboard from a class or group session for the students. A short title, a summary of 2–4 sentences, and up to 5 concrete next steps. Use only what is on the board. Write in the language of the board.',
    `Board: ${access.board.title}\nText on the board:\n${texts.join('\n')}`, SUMMARY, 900, true,
  );
  if (!out?.summary) throw new HttpException('The AI didn’t answer. Please try again.', 502);
  return { title: clip(out.title, 80), summary: clip(out.summary, 1200), nextSteps: (out.nextSteps ?? []).map((x) => clip(x, 160)).filter(Boolean).slice(0, 5) };
}
