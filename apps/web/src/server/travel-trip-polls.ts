import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, strings, type Body } from './body';
import { publish } from './realtime';
import { shortName } from './play';
import { memberIds, tripFor } from './travel-trips';

// M243: a trip's group polls. The people planning it (members only, tripFor) ask and vote on places, dates and stays;
// everyone's open page updates at once (publish). The poll's asker or the trip's starter closes or removes it.

export const POLL_KINDS = ['place', 'date', 'stay', 'other'] as const;
const MAX_POLLS = 30, MAX_OPTIONS = 8;
const clip = (v: unknown, n: number) => { const s = (str(v) ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, n) : null; };
const readOptions = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
const tell = async (tripId: string) => publish(await memberIds(tripId), { type: 'refresh', keys: [`/travel/trips/${tripId}/polls`] });

/** GET /travel/trips/:id/polls: each poll with its counts, who chose what (first names) and my choices. */
export async function tripPolls(u: SessionUser, id: string) {
  await tripFor(u, id);
  const polls = await prisma.travelTripPoll.findMany({ where: { tripId: id }, orderBy: { createdAt: 'desc' }, take: MAX_POLLS, include: { votes: { select: { userId: true, choice: true } } } });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(polls.flatMap((p) => [p.createdBy, ...p.votes.map((v) => v.userId)]))].slice(0, 90) } }, select: { id: true, name: true } });
  const name = (uid: string) => (uid === u.id ? 'You' : shortName(people.find((p) => p.id === uid)?.name));
  return {
    polls: polls.map((p) => {
      const options = readOptions(p.options);
      return {
        id: p.id, kind: p.kind, question: p.question, multi: p.multi, closed: p.closed, by: name(p.createdBy), mine: p.createdBy === u.id, createdAt: p.createdAt,
        options: options.map((text, i) => ({ text, voters: p.votes.filter((v) => v.choice === i).map((v) => name(v.userId)) })),
        chosen: p.votes.filter((v) => v.userId === u.id).map((v) => v.choice),
        people: new Set(p.votes.map((v) => v.userId)).size,
      };
    }),
  };
}

/** POST /travel/trips/:id/polls { kind, question, options, multi } */
export async function addTripPoll(u: SessionUser, id: string, b: Body) {
  await tripFor(u, id);
  const question = clip(b.question, 140);
  if (!question) throw new BadRequestException('Ask a question.');
  const options = [...new Set(strings(b.options).map((o) => clip(o, 80)).filter((o): o is string => !!o))].slice(0, MAX_OPTIONS);
  if (options.length < 2) throw new BadRequestException('Give at least two choices.');
  if ((await prisma.travelTripPoll.count({ where: { tripId: id } })) >= MAX_POLLS) throw new BadRequestException(`A trip keeps ${MAX_POLLS} polls: remove an old one.`);
  const poll = await prisma.travelTripPoll.create({ data: { tripId: id, kind: oneOf(POLL_KINDS, b.kind) ? b.kind : 'other', question, options: JSON.stringify(options), multi: b.multi === true, createdBy: u.id }, select: { id: true } });
  await tell(id);
  return { poll };
}

async function pollIn(tripId: string, pollId: string) {
  const p = await prisma.travelTripPoll.findFirst({ where: { id: pollId, tripId }, select: { id: true, options: true, multi: true, closed: true, createdBy: true } });
  if (!p) throw new NotFoundException('That poll isn’t there any more.');
  return p;
}

/** POST /travel/trips/:id/polls/:pollId/vote { choices }: my choices now (none takes my vote back). */
export async function voteTripPoll(u: SessionUser, id: string, pollId: string, b: Body) {
  await tripFor(u, id);
  const p = await pollIn(id, pollId);
  if (p.closed) throw new BadRequestException('This poll is closed.');
  const n = readOptions(p.options).length;
  const asked = Array.isArray(b.choices) ? b.choices : [];
  const choices = [...new Set(asked.filter((c): c is number => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < n))];
  if (choices.length !== asked.length) throw new BadRequestException('That choice isn’t in the poll.');
  if (!p.multi && choices.length > 1) throw new BadRequestException('Pick one.');
  await prisma.travelTripVote.deleteMany({ where: { pollId, userId: u.id } });
  if (choices.length) await prisma.travelTripVote.createMany({ data: choices.map((choice) => ({ pollId, userId: u.id, choice })) });
  await tell(id);
  return { ok: true };
}

/** PATCH /travel/trips/:id/polls/:pollId { closed }: its asker or the trip's starter. */
export async function updateTripPoll(u: SessionUser, id: string, pollId: string, b: Body) {
  const trip = await tripFor(u, id);
  const p = await pollIn(id, pollId);
  if (p.createdBy !== u.id && trip.ownerId !== u.id) throw new ForbiddenException('Only the person who asked can close it.');
  if (typeof b.closed !== 'boolean') throw new BadRequestException('Open or closed?');
  await prisma.travelTripPoll.update({ where: { id: pollId }, data: { closed: b.closed } });
  await tell(id);
  return { ok: true };
}

/** DELETE /travel/trips/:id/polls/:pollId: its asker or the trip's starter. */
export async function removeTripPoll(u: SessionUser, id: string, pollId: string) {
  const trip = await tripFor(u, id);
  const p = await pollIn(id, pollId);
  if (p.createdBy !== u.id && trip.ownerId !== u.id) throw new ForbiddenException('Only the person who asked can remove it.');
  await prisma.travelTripPoll.delete({ where: { id: pollId } });
  await tell(id);
  return { ok: true };
}
