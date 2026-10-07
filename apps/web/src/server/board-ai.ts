import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { boardAccess, canEdit } from './boards';
import { geminiJson, geminiJsonImage } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { featureOff } from './moderation';

// AI on boards (Stage 4 · 3.5): one AI request per action. The board's app sends the text on the
// board (sticky notes, labels) and draws what comes back, so the server never touches the drawing:
//   themes   sticky notes → 2–6 themes, each with the notes that belong to it
//   mindmap  a topic → a mind map (centre, 3–6 branches, up to 4 ideas each)
//   summary  "summarise this board" → a title, a few sentences and next steps
//   diagram  a rough sketch (the selected shapes, or the whole board, as a small PNG the app makes)
//            → a clean diagram: shapes with their text on a grid, and the arrows between them

const THEMES = { type: 'OBJECT', properties: { themes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, notes: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['name', 'notes'] } } }, required: ['themes'] };
const MINDMAP = { type: 'OBJECT', properties: { center: { type: 'STRING' }, branches: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, ideas: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['label', 'ideas'] } } }, required: ['center', 'branches'] };
const SUMMARY = { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, nextSteps: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'summary', 'nextSteps'] };

const DIAGRAM = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, label: { type: 'STRING' }, shape: { type: 'STRING', enum: ['box', 'round', 'diamond', 'ellipse'] }, row: { type: 'INTEGER' }, col: { type: 'INTEGER' } }, required: ['id', 'label', 'shape', 'row', 'col'] } },
    edges: { type: 'ARRAY', items: { type: 'OBJECT', properties: { from: { type: 'STRING' }, to: { type: 'STRING' }, label: { type: 'STRING' } }, required: ['from', 'to'] } },
  },
  required: ['title', 'nodes', 'edges'],
};
const DIAGRAM_SYSTEM = `You turn a rough hand-drawn whiteboard sketch (a flowchart, a process, a concept map, a simple diagram) into a clean diagram.
Read every shape with its text, and every arrow or line between shapes.
- nodes: id ("n1", "n2"…), label (the shape's text, cleaned up and spelled correctly, short; keep the sketch's language), shape ("box" for rectangles, "round" for rounded boxes or steps, "diamond" for decisions or questions, "ellipse" for start/end, circles and bubbles), and row/col: where the shape sits in the sketch on a grid (row 0 = top, col 0 = left; shapes side by side share a row, shapes one above the other share a column).
- edges: from/to node ids in the arrow's direction (for a plain line: top to bottom, or left to right), with the arrow's text as label if it has one.
- title: a short name for the diagram.
Up to 30 nodes. Never invent shapes or arrows that aren't in the sketch. If it isn't a diagram (only writing, or a drawing), return its readable text as boxes in reading order with no edges.`;

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

/** The AI's diagram, tidied: unique ids, real edges, and a compact grid with one shape per cell. */
function tidyDiagram(out: { title?: string; nodes?: { id: string; label: string; shape: string; row: number; col: number }[]; edges?: { from: string; to: string; label?: string }[] }) {
  const seen = new Set<string>();
  const nodes = (out.nodes ?? []).slice(0, 30).flatMap((n) => {
    const id = clip(n.id, 20);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const shape = n.shape === 'round' || n.shape === 'diamond' || n.shape === 'ellipse' ? n.shape : 'box';
    return [{ id, label: clip(n.label, 80) || '…', shape, row: Math.max(0, Math.min(40, Math.round(Number(n.row) || 0))), col: Math.max(0, Math.min(40, Math.round(Number(n.col) || 0))) }];
  });
  // Rows and columns numbered without gaps; two shapes in one cell: the second moves right.
  const rows = [...new Set(nodes.map((n) => n.row))].sort((a, b) => a - b), cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
  const taken = new Set<string>();
  for (const n of nodes.sort((a, b) => a.row - b.row || a.col - b.col)) {
    n.row = rows.indexOf(n.row);
    n.col = cols.indexOf(n.col);
    while (taken.has(`${n.row}:${n.col}`)) n.col += 1;
    taken.add(`${n.row}:${n.col}`);
  }
  const edges = (out.edges ?? []).filter((e) => seen.has(e.from) && seen.has(e.to) && e.from !== e.to).slice(0, 60).map((e) => ({ from: e.from, to: e.to, label: clip(e.label, 40) }));
  return { title: clip(out.title, 80), nodes, edges };
}

/** POST /api/boards/:id/ai { action, texts?, topic? } */
export async function boardAi(boardId: string, user: SessionUser, b: Record<string, unknown>) {
  const access = await boardAccess(boardId, user.id);
  if (!access) throw new NotFoundException('This board doesn’t exist or hasn’t been shared with you.');
  const action = b.action === 'themes' || b.action === 'mindmap' || b.action === 'summary' || b.action === 'diagram' ? b.action : null;
  if (!action) throw new BadRequestException('Unknown action.');
  // Grouping and mind maps add to the board; a summary only reads it.
  if (action !== 'summary' && !canEdit(access.role)) throw new ForbiddenException('You can only look at this board.');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now.', 503);
  const texts = Array.isArray(b.texts) ? (b.texts as unknown[]).map((t) => clip(t, 300)).filter(Boolean).slice(0, 150) : [];
  // The sketch as a PNG (base64, the app keeps it under 1024 px): checked before anything is spent.
  const image = action === 'diagram' && typeof b.image === 'string' ? b.image.replace(/^data:image\/png;base64,/, '') : '';
  if (action === 'diagram' && (!image || image.length > 3_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 2000)))) throw new BadRequestException('Draw or select a sketch first.');
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
  if (action === 'diagram') {
    const out = await geminiJsonImage<Parameters<typeof tidyDiagram>[0]>(DIAGRAM_SYSTEM, `Board: ${access.board.title}${texts.length ? `\nTyped text in the sketch (to help reading it): ${texts.slice(0, 40).join(' | ')}` : ''}`, { mimeType: 'image/png', data: image }, DIAGRAM, 3000);
    const d = out ? tidyDiagram(out) : null;
    if (!d?.nodes.length) throw new HttpException('The AI couldn’t read a diagram in this sketch. Try selecting just the drawing.', 502);
    return d;
  }
  if (!texts.length) throw new BadRequestException('There’s no text on this board to summarise yet.');
  const out = await geminiJson<{ title: string; summary: string; nextSteps: string[] }>(
    'You summarise a whiteboard from a class or group session for the students. A short title, a summary of 2–4 sentences, and up to 5 concrete next steps. Use only what is on the board. Write in the language of the board.',
    `Board: ${access.board.title}\nText on the board:\n${texts.join('\n')}`, SUMMARY, 900, true,
  );
  if (!out?.summary) throw new HttpException('The AI didn’t answer. Please try again.', 502);
  return { title: clip(out.title, 80), summary: clip(out.summary, 1200), nextSteps: (out.nextSteps ?? []).map((x) => clip(x, 160)).filter(Boolean).slice(0, 5) };
}
