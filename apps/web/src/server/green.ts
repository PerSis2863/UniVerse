import crypto from 'node:crypto';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BADGES, GREEN_KINDS, co2For, streak, weeklyChallenge, type GreenKind } from '@/lib/green';
import { toBase32 } from '@/lib/trace';
import { BadRequestException, NotFoundException } from './http';
import { oneOf, str, type Body } from './body';
import { num, short } from './trace';

// UniVerse Green (migration 0180): climate actions with the CO2 they save (factors in
// src/lib/green.ts), badges, a streak, a weekly challenge for everyone, teams that join with a code,
// a leaderboard and a shared map (positions rounded to 0.1°, about 11 km).

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;

/** GET /green/me: my totals, streak, badges, this week's challenge, my teams and recent actions. */
export async function greenMe(u: SessionUser) {
  const now = Date.now(), challenge = weeklyChallenge(now);
  const [actions, recent, teams, community] = await Promise.all([
    prisma.greenAction.findMany({ where: { userId: u.id }, select: { kind: true, amount: true, co2Kg: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5000 }),
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
  const mineWeek = actions.filter((a) => a.kind === challenge.kind && a.createdAt.getTime() >= weekStart).reduce((s, a) => s + a.amount, 0);
  const teamIds = teams.map((t) => t.teamId);
  const teamWeek = teamIds.length ? await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(SUM(a.amount), 0) AS n FROM green_actions a JOIN green_members m ON m.userId = a.userId WHERE m.teamId IN (${teamIds.map(() => '?').join(',')}) AND a.kind = ? AND a.createdAt >= ?`,
    ...teamIds, challenge.kind, iso(weekStart),
  ).catch(() => [] as Row[]) : [];
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const d = iso(now - (29 - i) * DAY).slice(0, 10);
    return { day: d, kg: Math.round(actions.filter((a) => a.createdAt.toISOString().slice(0, 10) === d).reduce((s, a) => s + a.co2Kg, 0) * 10) / 10 };
  });
  return {
    totals: { ...totals, kg: Math.round(kg * 10) / 10, kgByKind },
    badges: BADGES.map((b) => ({ id: b.id, label: b.label, text: b.text, earned: b.earned(totals) })),
    challenge: { ...challenge, mine: Math.round(mineWeek * 10) / 10, team: teamIds.length ? Math.round(N(teamWeek[0]?.n) * 10) / 10 : null },
    perDay, recent, teams: teamIds.length,
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
    data: { userId: u.id, kind: b.kind, amount, co2Kg: co2For(b.kind, amount), note: short(b.note, 300), lat: lat === null ? null : Math.round(lat * 10) / 10, lng: lng === null ? null : Math.round(lng * 10) / 10, place: short(b.place, 120) },
  });
}

export async function deleteGreenAction(u: SessionUser, id: string) {
  const a = await prisma.greenAction.findUnique({ where: { id } });
  if (!a || a.userId !== u.id) throw new NotFoundException('Action not found');
  await prisma.greenAction.delete({ where: { id } });
  return { ok: true };
}

/** GET /green/teams: my teams with their members and totals, the team leaderboard and the top people (30 days). */
export async function greenTeams(u: SessionUser) {
  const since = iso(Date.now() - 30 * DAY);
  const mine = await prisma.greenMember.findMany({ where: { userId: u.id }, select: { teamId: true } });
  const [teams, board, people] = await Promise.all([
    mine.length ? prisma.greenTeam.findMany({ where: { id: { in: mine.map((m) => m.teamId) } } }) : [],
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT t.id, t.name, COUNT(DISTINCT m.userId) AS members, COALESCE(SUM(a.co2Kg), 0) AS kg, COUNT(a.id) AS actions
       FROM green_teams t JOIN green_members m ON m.teamId = t.id LEFT JOIN green_actions a ON a.userId = m.userId AND a.createdAt > ?
       GROUP BY t.id ORDER BY kg DESC LIMIT 20`, since,
    ).catch(() => [] as Row[]),
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT u.id, u.name, COALESCE(SUM(a.co2Kg), 0) AS kg, COUNT(*) AS actions FROM green_actions a JOIN users u ON u.id = a.userId WHERE a.createdAt > ? GROUP BY u.id ORDER BY kg DESC LIMIT 10`, since,
    ).catch(() => [] as Row[]),
  ]);
  const detail = await Promise.all(teams.map(async (t) => {
    const members = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT u.id, u.name, COALESCE(SUM(a.co2Kg), 0) AS kg FROM green_members m JOIN users u ON u.id = m.userId LEFT JOIN green_actions a ON a.userId = m.userId AND a.createdAt > ? WHERE m.teamId = ? GROUP BY u.id ORDER BY kg DESC`, since, t.id,
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
