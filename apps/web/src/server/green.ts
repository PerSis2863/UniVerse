import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BADGES, FEELINGS, GREEN_FACTORS, GREEN_KINDS, co2For, easiestKind, streak, weeklyChallenge, type GreenKind } from '@/lib/green';
import { toBase32 } from '@/lib/trace';
import { isAppFileUrl } from '@/lib/storage';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { notify } from './email';
import { pushService } from './services/push.service';
import { num, short } from './trace';

// UniVerse Green (migration 0180): climate actions with the CO2 they save (factors in
// src/lib/green.ts), badges, a streak, a weekly challenge for everyone, teams that join with a code,
// a leaderboard and a shared map (positions rounded to 0.1°, about 11 km).
// Proof (migration 0183): an action can carry a photo; a teammate (never the person) confirms it.
// Only confirmed actions count for the weekly challenge and the leaderboards; everything logged still
// counts in the person's own totals.

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;

/** GET /green/me: my totals, streak, badges, this week's challenge, my teams and recent actions. */
export async function greenMe(u: SessionUser) {
  const now = Date.now(), challenge = weeklyChallenge(now);
  const [actions, recent, teams, community] = await Promise.all([
    prisma.greenAction.findMany({ where: { userId: u.id }, select: { kind: true, amount: true, co2Kg: true, createdAt: true, verifiedAt: true, feeling: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    prisma.greenAction.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.greenMember.findMany({ where: { userId: u.id }, select: { teamId: true } }),
    prisma.$queryRawUnsafe<Row[]>(`SELECT COALESCE(SUM(co2Kg), 0) AS kg, COUNT(*) AS n, COUNT(DISTINCT userId) AS people FROM green_actions`).catch(() => [] as Row[]),
  ]);
  const byKind: Partial<Record<GreenKind, number>> = {}, kgByKind: Partial<Record<GreenKind, number>> = {};
  for (const a of actions) { const k = a.kind as GreenKind; byKind[k] = (byKind[k] ?? 0) + a.amount; kgByKind[k] = (kgByKind[k] ?? 0) + a.co2Kg; }
  const kg = actions.reduce((s, a) => s + a.co2Kg, 0);
  const days = actions.map((a) => a.createdAt.toISOString().slice(0, 10));
  const totals = { actions: actions.length, kg, byKind, streak: streak(days, new Date(now).toISOString().slice(0, 10)) };
  const weekStart = Date.parse(challenge.starts);
  const thisWeek = actions.filter((a) => a.kind === challenge.kind && a.createdAt.getTime() >= weekStart);
  const mineWeek = thisWeek.filter((a) => a.verifiedAt).reduce((s, a) => s + a.amount, 0);
  const waitingWeek = thisWeek.filter((a) => !a.verifiedAt).reduce((s, a) => s + a.amount, 0);
  const teamIds = teams.map((t) => t.teamId);
  const teamWeek = teamIds.length ? await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(SUM(a.amount), 0) AS n FROM green_actions a JOIN green_members m ON m.userId = a.userId WHERE m.teamId IN (${teamIds.map(() => '?').join(',')}) AND a.kind = ? AND a.createdAt >= ? AND a.verifiedAt IS NOT NULL`,
    ...teamIds, challenge.kind, iso(weekStart),
  ).catch(() => [] as Row[]) : [];
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const d = iso(now - (29 - i) * DAY).slice(0, 10);
    return { day: d, kg: Math.round(actions.filter((a) => a.createdAt.toISOString().slice(0, 10) === d).reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 };
  });
  return {
    totals: { ...totals, kg: Math.round(kg * 10) / 10, kgByKind },
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, text: b.text, earned: b.earned(totals) })),
    challenge: { ...challenge, mine: Math.round(mineWeek * 10) / 10, waiting: Math.round(waitingWeek * 10) / 10, team: teamIds.length ? Math.round(N(teamWeek[0]?.n) * 10) / 10 : null },
    verified: { actions: actions.filter((a) => a.verifiedAt).length, kg: Math.round(actions.filter((a) => a.verifiedAt).reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 },
    perDay, recent, teams: teamIds.length, easiest: easiestKind(actions),
    community: { kg: Math.round(N(community[0]?.kg)), actions: N(community[0]?.n), people: N(community[0]?.people) },
  };
}

/** POST /green/actions { kind, amount, note?, lat?, lng?, place? }: log an action. */
export async function logGreenAction(u: SessionUser, b: Body) {
  if (!oneOf(GREEN_KINDS, b.kind)) throw new BadRequestException('Pick what you did.');
  const amount = num(b.amount, 0.1, 5000);
  if (amount === null) throw new BadRequestException('How much? (A number above zero.)');
  const today = await prisma.greenAction.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - DAY) } } });
  if (today >= 50) throw new BadRequestException('That’s 50 actions today: come back tomorrow.');
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  return prisma.greenAction.create({
    data: { userId: u.id, kind: b.kind, amount, co2Kg: co2For(b.kind, amount), note: short(b.note, 300), photoUrl: isAppFileUrl(b.photoUrl) ? b.photoUrl : null, lat: lat === null ? null : Math.round(lat * 10) / 10, lng: lng === null ? null : Math.round(lng * 10) / 10, place: short(b.place, 120) },
  });
}

export async function deleteGreenAction(u: SessionUser, id: string) {
  const a = await prisma.greenAction.findUnique({ where: { id } });
  if (!a || a.userId !== u.id) throw new NotFoundException('Action not found');
  await prisma.greenAction.delete({ where: { id } });
  return { ok: true };
}

/** GET /green/teams: my teams with their members and totals, the team leaderboard and the top people (30 days, confirmed actions). */
export async function greenTeams(u: SessionUser) {
  const since = iso(Date.now() - 30 * DAY);
  const mine = await prisma.greenMember.findMany({ where: { userId: u.id }, select: { teamId: true } });
  const [teams, board, people] = await Promise.all([
    mine.length ? prisma.greenTeam.findMany({ where: { id: { in: mine.map((m) => m.teamId) } } }) : [],
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT t.id, t.name, COUNT(DISTINCT m.userId) AS members, COALESCE(SUM(a.co2Kg), 0) AS kg, COUNT(a.id) AS actions
       FROM green_teams t JOIN green_members m ON m.teamId = t.id LEFT JOIN green_actions a ON a.userId = m.userId AND a.createdAt > ? AND a.verifiedAt IS NOT NULL
       GROUP BY t.id ORDER BY kg DESC LIMIT 20`, since,
    ).catch(() => [] as Row[]),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT u.id, u.name, COALESCE(SUM(a.co2Kg), 0) AS kg, COUNT(*) AS actions FROM green_actions a JOIN users u ON u.id = a.userId WHERE a.createdAt > ? AND a.verifiedAt IS NOT NULL GROUP BY u.id ORDER BY kg DESC LIMIT 10`, since,
    ).catch(() => [] as Row[]),
  ]);
  const detail = await Promise.all(teams.map(async (t) => {
    const members = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT u.id, u.name, COALESCE(SUM(a.co2Kg), 0) AS kg FROM green_members m JOIN users u ON u.id = m.userId LEFT JOIN green_actions a ON a.userId = m.userId AND a.createdAt > ? AND a.verifiedAt IS NOT NULL WHERE m.teamId = ? GROUP BY u.id ORDER BY kg DESC`, since, t.id,
    ).catch(() => [] as Row[]);
    return { id: t.id, name: t.name, code: t.code, owner: t.ownerId === u.id, members: members.map((m) => ({ id: m.id as string, name: m.name as string, kg: Math.round(N(m.kg) * 10) / 10, me: m.id === u.id })), kg: Math.round(members.reduce((s, m) => s + N(m.kg), 0) * 10) / 10 };
  }));
  return {
    mine: detail,
    leaderboard: board.map((t, i) => ({ rank: i + 1, id: t.id as string, name: t.name as string, members: N(t.members), kg: Math.round(N(t.kg) * 10) / 10, actions: N(t.actions), mine: mine.some((m) => m.teamId === t.id) })),
    people: people.map((p, i) => ({ rank: i + 1, name: String(p.name ?? 'Someone'), kg: Math.round(N(p.kg) * 10) / 10, actions: N(p.actions), me: p.id === u.id })),
  };
}

export async function createGreenTeam(u: SessionUser, b: Body) {
  const name = short(b.name, 60);
  if (!name) throw new BadRequestException('Name your team.');
  const code = toBase32(crypto.randomBytes(5), 6);
  const team = await prisma.greenTeam.create({ data: { name, code, ownerId: u.id } });
  await prisma.greenMember.create({ data: { teamId: team.id, userId: u.id } });
  return team;
}

export async function joinGreenTeam(u: SessionUser, b: Body) {
  const code = str(b.code)?.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  const team = code ? await prisma.greenTeam.findUnique({ where: { code } }) : null;
  if (!team) throw new NotFoundException('No team has that code.');
  await prisma.greenMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: u.id } }, create: { teamId: team.id, userId: u.id }, update: {} });
  return team;
}

export async function leaveGreenTeam(u: SessionUser, teamId: string) {
  await prisma.greenMember.deleteMany({ where: { teamId, userId: u.id } });
  return { ok: true };
}

/** GET /green/map: every action of the last 90 days on a 0.1° grid (no person can be found). */
export async function greenMap() {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT ROUND(lat, 1) AS lat, ROUND(lng, 1) AS lng, COALESCE(SUM(co2Kg), 0) AS kg, COUNT(*) AS n, MAX(place) AS place FROM green_actions WHERE lat IS NOT NULL AND createdAt > ? GROUP BY 1, 2 ORDER BY kg DESC LIMIT 1500`,
    iso(Date.now() - 90 * DAY),
  ).catch(() => [] as Row[]);
  return { cells: rows.map((r) => ({ lat: N(r.lat), lng: N(r.lng), kg: Math.round(N(r.kg) * 10) / 10, actions: N(r.n), place: (r.place as string | null) ?? null })) };
}

/** POST /green/actions/:id/proof { photoUrl }: adds or replaces the photo of my own action (until it's confirmed). */
export async function addGreenProof(u: SessionUser, id: string, b: Body) {
  if (!isAppFileUrl(b.photoUrl)) throw new BadRequestException('Add a photo first.');
  const done = await prisma.greenAction.updateMany({ where: { id, userId: u.id, verifiedAt: null }, data: { photoUrl: b.photoUrl } });
  if (!done.count) throw new NotFoundException('Action not found, or it’s already confirmed.');
  return { ok: true };
}

/** POST /green/actions/:id/feeling { feeling }: "how did it go?" on my own action. */
export async function setGreenFeeling(u: SessionUser, id: string, b: Body) {
  if (!oneOf(FEELINGS, b.feeling)) throw new BadRequestException('Pick easy, okay or hard.');
  const done = await prisma.greenAction.updateMany({ where: { id, userId: u.id }, data: { feeling: b.feeling } });
  if (!done.count) throw new NotFoundException('Action not found');
  return { ok: true };
}

/** The teams a person is in. */
const teamsOf = async (userId: string) => (await prisma.greenMember.findMany({ where: { userId }, select: { teamId: true } })).map((m) => m.teamId);

/** GET /green/proofs: my teammates' actions with a photo that nobody has confirmed yet (30 days). */
export async function greenProofs(u: SessionUser) {
  const teams = await teamsOf(u.id);
  if (!teams.length) return { proofs: [], teams: 0 };
  const mates = [...new Set((await prisma.greenMember.findMany({ where: { teamId: { in: teams.slice(0, 90) }, userId: { not: u.id } }, select: { userId: true }, take: 2000 })).map((m) => m.userId))].slice(0, 90);
  if (!mates.length) return { proofs: [], teams: teams.length };
  const rows = await prisma.greenAction.findMany({
    where: { userId: { in: mates }, photoUrl: { not: null }, verifiedAt: null, createdAt: { gt: new Date(Date.now() - 30 * DAY) } },
    orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, userId: true, kind: true, amount: true, co2Kg: true, note: true, photoUrl: true, place: true, createdAt: true },
  });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  return { proofs: rows.map(({ userId, ...r }) => ({ ...r, by: people.find((p) => p.id === userId)?.name ?? 'A teammate' })), teams: teams.length };
}

/** POST /green/actions/:id/confirm: a teammate (never the person) confirms an action with a photo. */
export async function confirmGreenAction(u: SessionUser, id: string) {
  const a = await prisma.greenAction.findUnique({ where: { id }, select: { id: true, userId: true, kind: true, amount: true, co2Kg: true, photoUrl: true, verifiedAt: true } });
  if (!a) throw new NotFoundException('Action not found');
  if (a.userId === u.id) throw new ForbiddenException('A teammate confirms your actions, not you.');
  if (!a.photoUrl) throw new BadRequestException('This action has no photo to confirm.');
  const theirs = await teamsOf(a.userId);
  const shared = theirs.length ? await prisma.greenMember.count({ where: { userId: u.id, teamId: { in: theirs.slice(0, 90) } } }) : 0;
  if (!shared) throw new ForbiddenException('Only someone in one of their teams can confirm it.');
  const done = await prisma.greenAction.updateMany({ where: { id, verifiedAt: null }, data: { verifiedBy: u.id, verifiedAt: new Date() } });
  if (!done.count) return { ok: true, already: true };
  const f = GREEN_FACTORS[a.kind as GreenKind];
  const n = { title: `${u.name ?? 'A teammate'} confirmed your action`, body: `${a.amount} ${f?.units ?? ''} · ${f?.label.toLowerCase() ?? 'climate action'}: ${a.co2Kg} kg CO₂ now counts for the challenge and the leaderboards.`, link: '/green' };
  await notify(a.userId, { type: 'green', ...n, email: false });
  await pushService.sendToUser(a.userId, { title: n.title, body: n.body.slice(0, 140), url: n.link, tag: `green-${id}` }).catch(() => 0);
  return { ok: true };
}
