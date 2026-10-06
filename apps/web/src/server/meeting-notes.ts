import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { MAX_BODY, getSystemUser, membership, messageSelect } from '@/lib/chat';
import type { SessionUser } from '@/lib/server-auth';
import { spendAi } from './ai-budget';
import { breakoutOf, callAccess, callPeople } from './calls';
import { afterSend } from './chat-notify';
import { cleanTranscript, type TranscriptLine } from './class-companion';
import { channelSendCheck } from './communities';
import { notifyMany } from './email';
import { geminiJson } from './gemini';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from './http';
import { chatMuted, featureOff } from './moderation';
import { groupAccess } from './spaces';

// Meeting notes for every call that isn't a class (Stage 4 · 2.8; class calls make study packs,
// src/server/class-companion.ts). Whoever runs the call (or either person in a one-to-one call)
// turns notes on; everyone's browser captions their own speech and the note-taker's browser keeps
// the finished sentences. When notes stop, ONE AI request turns them into a title, a summary,
// decisions, action items (with who and by when, when that was said) and chapters, posted where the
// call happened: in the chat (chat calls, group voice rooms), as a post in the study group, or (call
// links and community voice rooms, which have no chat to post in) to everyone who was in the call,
// in the app. Action items can be added to my tasks, which feed my study planner. Text only.

export interface ActionItem { text: string; who: string; due: string }
interface Notes { title: string; summary: string; decisions: string[]; actions: ActionItem[]; chapters: { t: number; title: string }[] }

const SYSTEM = [
  'You write the notes of a call between students, teachers or staff on UniVerse (a meeting, a study session, a project call), from its automatic captions: expect missing words and mistakes, and ignore small talk, greetings and technical problems ("can you hear me").',
  'Write in the language the call was held in. Only use what was said; never invent facts, names, dates or numbers.',
  'title: a short title for the call (at most 8 words). summary: 2 to 4 sentences on what was discussed.',
  'decisions: what was decided or agreed, 0 to 8 short items (empty when nothing was decided).',
  'actions: things someone said they (or someone else) would do, 0 to 10: text = the task, starting with a verb; who = the name of the person who will do it, as said in the call (empty if unclear or everyone); due = the day it is due as YYYY-MM-DD when a day was said (use today\'s date to work out "Friday" or "tomorrow"), else empty.',
  'chapters: 2 to 8 parts of the call in order, each with t = the seconds value of the line where it starts and a short title (fewer for a short call).',
].join(' ');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    decisions: { type: 'ARRAY', items: { type: 'STRING' } },
    actions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, who: { type: 'STRING' }, due: { type: 'STRING' } }, required: ['text', 'who', 'due'] } },
    chapters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { t: { type: 'NUMBER' }, title: { type: 'STRING' } }, required: ['t', 'title'] } },
  },
  required: ['title', 'summary', 'decisions', 'actions', 'chapters'],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const parse = <T,>(v: string | null | undefined): T[] => { try { const x = JSON.parse(v ?? '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };

function cleanNotes(raw: Partial<Notes> | null, durationSec: number): Notes | null {
  const summary = str(raw?.summary, 2000);
  if (!raw || !summary) return null;
  const today = Date.now();
  return {
    title: str(raw.title, 100) || 'Call notes',
    summary,
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).map((d) => str(d, 300)).filter(Boolean).slice(0, 8),
    actions: (Array.isArray(raw.actions) ? raw.actions : [])
      .map((a) => {
        const due = str(a?.due, 10);
        const t = /^\d{4}-\d{2}-\d{2}$/.test(due) ? Date.parse(`${due}T12:00:00Z`) : NaN;
        // A due day from yesterday to a year ahead; anything else was a misreading.
        const ok = Number.isFinite(t) && t > today - 2 * 86_400_000 && t < today + 366 * 86_400_000;
        return { text: str(a?.text, 200), who: str(a?.who, 60), due: ok ? due : '' };
      })
      .filter((a) => a.text).slice(0, 10),
    chapters: (Array.isArray(raw.chapters) ? raw.chapters : [])
      .map((c) => ({ t: Math.max(0, Math.min(durationSec || 6 * 3600, Math.round(Number(c?.t) || 0))), title: str(c?.title, 120) }))
      .filter((c) => c.title).sort((a, b) => a.t - b.t).filter((c, i, all) => i === 0 || c.t > all[i - 1].t).slice(0, 10),
  };
}

/** One AI request. Null when AI isn't available (the notes are kept as PENDING, to make later). */
async function makeNotes(lines: TranscriptLine[], callTitle: string, durationSec: number, user: SessionUser): Promise<Notes | null> {
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) return null;
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const prompt = `Call: ${callTitle}\nToday: ${new Date().toISOString().slice(0, 10)}\nLength: ${clock(durationSec)}\n\nTranscript (seconds · speaker · words):\n${lines.map((l) => `${l.t} · ${l.who} · ${l.text}`).join('\n')}`;
  return cleanNotes(await geminiJson<Partial<Notes>>(SYSTEM, prompt, SCHEMA, 3000), durationSec);
}

const noteData = (n: Notes) => ({ status: 'READY', title: n.title, summary: n.summary, decisions: JSON.stringify(n.decisions), actions: JSON.stringify(n.actions), chapters: JSON.stringify(n.chapters) });

/** The notes as text: the chat message's body (search, previews, notifications) and the group post. */
function notesText(n: { title: string; summary: string | null; decisions: string[]; actions: ActionItem[] }) {
  const parts = [`📝 **Meeting notes: ${n.title}**`, n.summary ?? ''];
  if (n.decisions.length) parts.push(`**Decided**\n${n.decisions.map((d) => `- ${d}`).join('\n')}`);
  if (n.actions.length) parts.push(`**To do**\n${n.actions.map((a) => `- ${a.who ? `${a.who}: ` : ''}${a.text}${a.due ? ` (by ${a.due})` : ''}`).join('\n')}`);
  return parts.filter(Boolean).join('\n\n').slice(0, MAX_BODY);
}

/** Whether this person may see these notes. */
async function canSee(note: { createdById: string; conversationId: string | null; groupId: string | null; callId: string; people: string }, user: SessionUser) {
  if (note.createdById === user.id) return true;
  if (note.conversationId && (await membership(note.conversationId, user.id))) return true;
  if (note.groupId && (await groupAccess(note.groupId, user))) return true;
  if (parse<string>(note.people).includes(user.id)) return true;
  return !!(await prisma.callStat.findFirst({ where: { callId: note.callId, userId: user.id }, select: { id: true } }));
}

/** Posts finished notes where the call happened (see the top of this file). */
async function deliver(noteId: string, user: SessionUser) {
  const note = await prisma.callNote.findUnique({ where: { id: noteId } });
  if (!note || note.status !== 'READY') return;
  const shown = { title: note.title, summary: note.summary, decisions: parse<string>(note.decisions), actions: parse<ActionItem>(note.actions) };
  const body = notesText(shown);
  const link = `/calls?note=${note.id}`;
  if (note.conversationId) {
    const convo = await prisma.conversation.findUnique({ where: { id: note.conversationId }, select: { disappearingSec: true, communityId: true } });
    const blocked = !convo || (await chatMuted(user.id)) || (await channelSendCheck(note.conversationId, user.id, { slowMode: false }));
    if (!blocked) {
      const metadata = { meetingNotes: { id: note.id, ...shown, durationSec: note.durationSec } };
      const message = await prisma.message.create({
        data: {
          conversationId: note.conversationId, senderId: user.id, type: 'TEXT', body, metadata: metadata as unknown as Prisma.InputJsonValue,
          expiresAt: convo!.disappearingSec ? new Date(Date.now() + convo!.disappearingSec * 1000) : null,
        },
        select: { ...messageSelect, sender: { select: { id: true, name: true, avatar: true } } },
      });
      await prisma.$transaction([
        prisma.conversation.update({ where: { id: note.conversationId }, data: { updatedAt: new Date() } }),
        prisma.callNote.update({ where: { id: note.id }, data: { messageId: message.id } }),
      ]);
      const system = await getSystemUser();
      afterSend({ id: message.id, conversationId: note.conversationId, type: 'TEXT', body, metadata }, user, { communityId: convo!.communityId, systemUserId: system.id });
      return;
    }
  }
  if (note.groupId) {
    await prisma.groupPost.create({ data: { groupId: note.groupId, authorId: user.id, body: body.replace(/\*\*/g, '') } });
  }
  // Everyone who was in the call (and isn't reading it in a chat): in the app, never by email.
  const people = [...new Set([...parse<string>(note.people), ...(await prisma.callStat.findMany({ where: { callId: note.callId }, select: { userId: true }, take: 500 })).map((s) => s.userId)])].filter((id) => id !== user.id);
  if (people.length) await notifyMany(people, { type: 'event', title: `Meeting notes: ${note.title}`, body: shown.summary ?? '', link, email: false });
}

/** POST /api/calls/<call>/companion for calls that aren't classes: { transcript, durationSec }. */
export async function createMeetingNotes(callId: string, user: SessionUser, body: Record<string, unknown>) {
  if (breakoutOf(callId)) throw new BadRequestException('Take meeting notes in the main call.');
  const info = await callAccess(callId, user);
  const link = callId.startsWith('l_');
  const people = await callPeople(callId);
  const host = info.host || info.oneToOne || (link && people.creator === user.id);
  if (!host) throw new ForbiddenException('Only whoever runs the call can take meeting notes.');
  const lines = cleanTranscript(body.transcript);
  if (!lines.length) throw new BadRequestException('No transcript: captions need Chrome, Edge or Safari, and someone has to speak while notes are on.');
  const durationSec = Math.max(lines[lines.length - 1].t, Math.min(6 * 3600, Math.round(Number(body.durationSec) || 0)));
  const kind = link ? 'link' : callId.startsWith('g_') ? 'group' : callId.startsWith('r_') ? 'room' : 'chat';
  const notes = await makeNotes(lines, info.title, durationSec, user);
  const note = await prisma.callNote.create({
    data: {
      callId, kind, conversationId: kind === 'chat' || kind === 'room' ? info.chatId ?? null : null, groupId: kind === 'group' ? callId.slice(2) : null,
      createdById: user.id, startedAt: new Date(Date.now() - durationSec * 1000), durationSec, transcript: JSON.stringify(lines),
      people: JSON.stringify([...new Set([user.id, ...people.ids])]),
      ...(notes ? noteData(notes) : { status: 'PENDING', title: info.title }),
    },
    select: { id: true, status: true, kind: true },
  });
  if (notes) await deliver(note.id, user);
  const where = note.kind === 'group' ? 'posted in the group' : note.kind === 'link' ? 'sent to everyone who was in the call' : 'posted in the chat';
  return { ...note, message: notes ? `Meeting notes ${where}.` : 'The notes are saved. AI isn’t available right now: open Calls and tap Make notes later.' };
}

/** GET /api/meeting-notes/[id]: the notes (never the transcript), for the people they're for. */
export async function getMeetingNote(id: string, user: SessionUser) {
  const note = await prisma.callNote.findUnique({ where: { id } });
  if (!note || !(await canSee(note, user))) throw new NotFoundException('These notes aren’t available.');
  return {
    id: note.id, callId: note.callId, kind: note.kind, conversationId: note.conversationId, title: note.title, startedAt: note.startedAt, durationSec: note.durationSec,
    status: note.status, summary: note.summary, decisions: parse<string>(note.decisions), actions: parse<ActionItem>(note.actions), chapters: parse<{ t: number; title: string }>(note.chapters),
    canRetry: note.createdById === user.id && note.status === 'PENDING' && !!note.transcript,
  };
}

/** POST /api/meeting-notes/[id]/retry: make notes saved while AI was unavailable, then post them. */
export async function retryMeetingNotes(id: string, user: SessionUser) {
  const note = await prisma.callNote.findUnique({ where: { id } });
  if (!note || note.createdById !== user.id) throw new NotFoundException('These notes aren’t available.');
  if (note.status === 'READY') return { id, status: 'READY' };
  const lines = cleanTranscript(parse(note.transcript));
  if (!lines.length) throw new BadRequestException('This call’s transcript is no longer kept.');
  const notes = await makeNotes(lines, note.title, note.durationSec, user);
  if (!notes) throw new HttpException('AI isn’t available right now. Please try again later.', 503);
  await prisma.callNote.update({ where: { id }, data: noteData(notes) });
  await deliver(id, user);
  return { id, status: 'READY' };
}

/**
 * POST /api/meeting-notes/[id]/tasks { index }: one action item into my tasks (my "From meetings"
 * board, made the first time), with its due day, so it also shows in my study planner.
 */
export async function addActionTask(id: string, user: SessionUser, index: unknown) {
  const note = await prisma.callNote.findUnique({ where: { id } });
  if (!note || !(await canSee(note, user))) throw new NotFoundException('These notes aren’t available.');
  const action = parse<ActionItem>(note.actions)[Number(index)];
  if (!action) throw new NotFoundException('That action item isn’t in these notes.');
  let board = await prisma.taskBoard.findFirst({ where: { ownerId: user.id, title: 'From meetings', courseId: null, groupId: null }, select: { id: true } });
  if (!board) {
    board = await prisma.taskBoard.create({ data: { title: 'From meetings', ownerId: user.id }, select: { id: true } });
    await prisma.taskList.createMany({ data: ['To do', 'Doing', 'Done'].map((t, i) => ({ boardId: board!.id, title: t, position: i + 1 })) });
  }
  const tag = `[meeting:${note.id}]`;
  const same = await prisma.task.findFirst({ where: { boardId: board.id, title: action.text, notes: { contains: tag } }, select: { id: true } });
  if (same) return { taskId: same.id, boardId: board.id, already: true };
  const list = await prisma.taskList.findFirst({ where: { boardId: board.id }, orderBy: { position: 'asc' }, select: { id: true } });
  if (!list) throw new HttpException('Your "From meetings" board has no lists. Add one, then try again.', 409);
  const last = await prisma.task.findFirst({ where: { listId: list.id }, orderBy: { position: 'desc' }, select: { position: true } });
  const task = await prisma.task.create({
    data: {
      boardId: board.id, listId: list.id, title: action.text, createdById: user.id, assigneeId: user.id, position: (last?.position ?? 0) + 1,
      dueAt: action.due ? new Date(`${action.due}T17:00:00Z`) : null,
      notes: `From the meeting notes “${note.title}” (${note.startedAt.toISOString().slice(0, 10)}). ${tag}`,
    },
    select: { id: true },
  });
  return { taskId: task.id, boardId: board.id, already: false };
}

