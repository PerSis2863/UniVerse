import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import {
  DEFAULT_RUBRIC, LEAGUE_ROLES, ROLE_LABEL, TEAM_SIZE, campusMixAllowed, cleanJudgeScores, cleanLink, criterionAverages, defaultMilestones,
  demoOpen, isoOrNull, leagueCallId, leagueRubric, parseJson, parseMilestones, parsePrizes, rankTeams, sdgName, signupOpen, slugify,
  submitProblem, validSdg, type JudgeScore, type LeagueRole, type Prize,
} from '@/lib/impact-league';
import { parseRubric } from '@/lib/oral';
import { audit } from './audit';
import { oneOf, str, text, type Body } from './body';
import { later, notifyMany } from './email';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from './http';
import { publish } from './realtime';
import { minorsAmong } from './safety';
import { publicAppUrl } from './services/credential-signer';

// Impact League (Stage 5 · D14): seasonal challenges between the universities of the campus network
// (upgrade 9) around a UN goal, e.g. "Clean water ideas".
//  - Admins and teachers start a challenge and become its organizers; organizers add mentors, judges,
//    sponsors and more organizers by email, set the milestones, the judging rubric and the prizes.
//  - While it's open, students form teams (any university; a team with someone under 18 stays within
//    one university). Each team gets a private group (chat posts, calls g_<group>) and a task board
//    whose cards are the challenge's milestones (labelled "Milestone"). A mentor joins the team's group.
//  - Demo day is a call (lg_<challenge>, src/server/calls.ts): organizers host it (webinar mode for a
//    big audience); anyone signed in may watch from 15 minutes before it starts.
//  - Judges score handed-in projects on the rubric; organizers give sponsors' prizes and finish the
//    challenge; every finisher (a member of a team that handed in) gets a signed credential.
//  - The public showcase (/league/<slug>, publicShowcase) shows the challenge, prizes and the teams
//    that chose to appear: team names, universities and projects, never people's names.
// Notifications are in the app only (never email).

const MAX_TEAMS = 200;
const MAX_PEOPLE = 200;
const CREDENTIALS_PER_CALL = 20;
const MILESTONE_LABEL = '"Milestone"';

const isAdmin = (u: SessionUser) => u.role === 'ADMIN' || u.owner === true;
const isStaff = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'TEACHER';
const clip = (v: unknown, max: number) => text(v).replace(/\s+/g, ' ').trim().slice(0, max);
const para = (v: unknown, max: number) => text(v).trim().slice(0, max);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Student';
const pageOf = (id: string) => `/impact-league/${id}`;
/** Splits a long list into pieces D1 accepts in one query (at most 100 values). */
const chunks = <T,>(xs: T[], n = 90) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function load(id: string) {
  const c = await prisma.leagueChallenge.findUnique({ where: { id } });
  if (!c) throw new NotFoundException('This challenge doesn’t exist.');
  return c;
}
type Challenge = Awaited<ReturnType<typeof load>>;
interface Ctx { c: Challenge; roles: Set<LeagueRole>; organizer: boolean }

/** The challenge and this person's parts in it. A draft is only for the people running it. */
async function context(id: string, user: SessionUser): Promise<Ctx> {
  const [c, rows] = await Promise.all([load(id), prisma.leaguePerson.findMany({ where: { challengeId: id, userId: user.id }, select: { role: true } })]);
  const roles = new Set(rows.map((r) => r.role as LeagueRole));
  const organizer = isAdmin(user) || roles.has('ORGANIZER');
  if (c.status === 'DRAFT' && !organizer && !roles.size) throw new NotFoundException('This challenge doesn’t exist.');
  return { c, roles, organizer };
}
const mustOrganize = (ctx: Ctx) => {
  if (!ctx.organizer) throw new ForbiddenException('Only the challenge’s organizers can do that.');
};

/** Everyone with a part in a challenge: its people and every team member. */
async function everyone(challengeId: string) {
  const [people, members] = await Promise.all([
    prisma.leaguePerson.findMany({ where: { challengeId }, select: { userId: true }, take: 500 }),
    prisma.leagueMember.findMany({ where: { challengeId }, select: { userId: true }, take: 2000 }),
  ]);
  return [...new Set([...people, ...members].map((p) => p.userId))];
}
async function refresh(challengeId: string, also: string[] = []) {
  publish([...(await everyone(challengeId)), ...also], { type: 'refresh', keys: [`/api/impact-league/${challengeId}`, '/api/impact-league'] });
}
const peopleWith = async (challengeId: string, role: LeagueRole) =>
  (await prisma.leaguePerson.findMany({ where: { challengeId, role }, select: { userId: true }, take: 500 })).map((p) => p.userId);
const teamMembers = async (teamId: string) => (await prisma.leagueMember.findMany({ where: { teamId }, select: { userId: true } })).map((m) => m.userId);

async function freeSlug(base: string) {
  const taken = new Set((await prisma.leagueChallenge.findMany({ where: { slug: { startsWith: base } }, select: { slug: true }, take: 500 })).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 500; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** Milestone cards done on each team's board: ticked as done, or moved to its "Done" list. */
async function milestoneProgress(boardIds: string[]) {
  const out = new Map<string, { done: number; total: number }>();
  for (const ids of chunks(boardIds)) {
    const where = { boardId: { in: ids }, labels: { contains: MILESTONE_LABEL } };
    const [all, done] = await Promise.all([
      prisma.task.groupBy({ by: ['boardId'], where, _count: { _all: true } }),
      prisma.task.groupBy({ by: ['boardId'], where: { ...where, OR: [{ doneAt: { not: null } }, { list: { title: 'Done' } }] }, _count: { _all: true } }),
    ]);
    for (const r of all) out.set(r.boardId, { done: 0, total: r._count._all });
    for (const r of done) { const p = out.get(r.boardId); if (p) p.done = r._count._all; }
  }
  return out;
}

// ── Challenges ───────────────────────────────────────────────────────────────────────────────────

/** GET /api/impact-league: the challenges I can see (open ones first) and my part in each. */
export async function leagueList(user: SessionUser) {
  const rows = await prisma.leagueChallenge.findMany({
    where: isAdmin(user) ? {} : { OR: [{ status: { not: 'DRAFT' } }, { people: { some: { userId: user.id } } }] },
    orderBy: { createdAt: 'desc' }, take: 60,
    select: {
      id: true, slug: true, title: true, sdg: true, summary: true, status: true, teamMin: true, teamMax: true, mixCampuses: true, isPublic: true,
      signupClosesAt: true, demoDayAt: true, _count: { select: { teams: true, members: true } },
    },
  });
  const ids = rows.map((r) => r.id);
  const [mine, roles] = ids.length
    ? await Promise.all([
      prisma.leagueMember.findMany({ where: { userId: user.id, challengeId: { in: ids } }, select: { challengeId: true, team: { select: { id: true, name: true } } } }),
      prisma.leaguePerson.findMany({ where: { userId: user.id, challengeId: { in: ids } }, select: { challengeId: true, role: true } }),
    ])
    : [[], []];
  const order: Record<string, number> = { OPEN: 0, JUDGING: 1, DRAFT: 2, DONE: 3 };
  const challenges = rows
    .map(({ _count, ...c }) => ({
      ...c, sdgName: sdgName(c.sdg), teams: _count.teams, people: _count.members,
      signupOpen: signupOpen(c), demoOpen: c.status !== 'DRAFT' && demoOpen(c.demoDayAt),
      myTeam: mine.find((m) => m.challengeId === c.id)?.team ?? null,
      myRoles: roles.filter((r) => r.challengeId === c.id).map((r) => r.role),
    }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return { challenges, canCreate: isStaff(user) };
}

/** POST /api/impact-league { title, sdg?, summary?, brief? }: admins and teachers start a draft. */
export async function createChallenge(user: SessionUser, b: Body) {
  if (!isStaff(user)) throw new ForbiddenException('Only admins and teachers can start a challenge.');
  const title = clip(b.title, 100);
  if (title.length < 4) throw new BadRequestException('Give the challenge a title (at least 4 characters).');
  if ((await prisma.leagueChallenge.count({ where: { createdById: user.id, status: 'DRAFT' } })) >= 10) throw new BadRequestException('You have 10 draft challenges. Open or delete one first.');
  const c = await prisma.leagueChallenge.create({
    data: {
      slug: await freeSlug(slugify(title)), title, sdg: validSdg(b.sdg), summary: clip(b.summary, 200), brief: para(b.brief, 4000),
      milestones: JSON.stringify(defaultMilestones()), rubric: JSON.stringify(DEFAULT_RUBRIC), createdById: user.id,
    },
    select: { id: true, slug: true },
  });
  await prisma.leaguePerson.create({ data: { challengeId: c.id, userId: user.id, role: 'ORGANIZER' } });
  publish([user.id], { type: 'refresh', keys: ['/api/impact-league'] });
  return c;
}

/** GET /api/impact-league/:id: the challenge, its people and teams, and what I can do in it. */
export async function challengeDetail(id: string, user: SessionUser) {
  const { c, roles, organizer } = await context(id, user);
  const [people, teams, scores, minor] = await Promise.all([
    prisma.leaguePerson.findMany({ where: { challengeId: id }, orderBy: { createdAt: 'asc' }, take: MAX_PEOPLE * 2, select: { role: true, user: { select: { id: true, name: true, avatar: true, campus: { select: { name: true } } } } } }),
    prisma.leagueTeam.findMany({
      where: { challengeId: id }, orderBy: { createdAt: 'asc' }, take: MAX_TEAMS,
      select: {
        id: true, name: true, lookingFor: true, groupId: true, boardId: true, projectTitle: true, pitch: true, link: true, showcase: true, hidden: true, status: true, submittedAt: true,
        mentor: { select: { id: true, name: true } },
        members: { orderBy: { joinedAt: 'asc' }, select: { captain: true, certificateId: true, user: { select: { id: true, name: true, avatar: true, campusId: true, campus: { select: { name: true } } } } } },
      },
    }),
    prisma.leagueScore.findMany({ where: { team: { challengeId: id } }, take: 5000, select: { teamId: true, judgeId: true, scores: true, total: true, comment: true, judge: { select: { name: true } } } }),
    user.role === 'STUDENT' ? minorsAmong([user.id]).then((s) => s.has(user.id)) : Promise.resolve(false),
  ]);
  const judge = roles.has('JUDGE'), mentor = roles.has('MENTOR'), staffView = organizer || judge || mentor;
  const rubric = leagueRubric(parseJson(c.rubric));
  const milestones = parseMilestones(parseJson(c.milestones));
  const prizes = parsePrizes(parseJson(c.prizes), new Set(teams.map((t) => t.id)));
  const progress = await milestoneProgress(teams.flatMap((t) => (t.boardId ? [t.boardId] : [])));
  const myTeam = teams.find((t) => t.members.some((m) => m.user.id === user.id)) ?? null;
  const submitted = teams.filter((t) => t.status === 'SUBMITTED');
  const showRanking = organizer || (judge && c.status === 'DONE');
  const ranking = showRanking ? rankTeams(submitted.map((t) => t.id), scores) : [];
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  const shownTeams = teams.map((t) => {
    const mine = t.id === myTeam?.id, mentoring = t.mentor?.id === user.id;
    const full = staffView || mine; // full names for the people running it and teammates; first names otherwise
    const campuses = new Set(t.members.map((m) => m.user.campus?.name).filter(Boolean));
    const mySheet = judge ? scores.find((s) => s.teamId === t.id && s.judgeId === user.id) : undefined;
    return {
      id: t.id, name: t.name, lookingFor: t.lookingFor, status: t.status, submittedAt: t.submittedAt,
      mine, mentoring, mentor: t.mentor, seats: Math.max(0, c.teamMax - t.members.length), campuses: campuses.size,
      members: t.members.map((m) => ({
        id: m.user.id, name: full ? m.user.name : firstName(m.user.name), avatar: full ? m.user.avatar : null, campus: m.user.campus?.name ?? null, captain: m.captain,
        ...(organizer || m.user.id === user.id ? { credential: !!m.certificateId && !m.certificateId.startsWith('pending:') } : {}),
      })),
      progress: t.boardId ? progress.get(t.boardId) ?? { done: 0, total: 0 } : { done: 0, total: 0 },
      // The project: for everyone once handed in; before that, for the team, its mentor and organizers.
      project: t.status === 'SUBMITTED' || mine || mentoring || organizer ? { title: t.projectTitle, pitch: t.pitch, link: t.link } : null,
      ...(mine || mentoring || organizer ? { groupId: t.groupId, boardId: t.boardId } : {}),
      ...(mine || organizer ? { showcase: t.showcase, hidden: t.hidden } : {}),
      ...(organizer ? { judged: scores.filter((s) => s.teamId === t.id).length } : {}),
      ...(judge ? { myScore: mySheet ? { scores: (parseJson(mySheet.scores) as JudgeScore[] | null) ?? [], comment: mySheet.comment, total: mySheet.total } : null } : {}),
    };
  });

  // My team's feedback once results are out: averages per criterion and the judges' comments (unsigned).
  let feedback = null;
  if (myTeam && c.status === 'DONE' && myTeam.status === 'SUBMITTED') {
    const sheets = scores.filter((s) => s.teamId === myTeam.id);
    feedback = {
      judges: sheets.length,
      criteria: criterionAverages(rubric, sheets.map((s) => (parseJson(s.scores) as JudgeScore[] | null) ?? [])),
      comments: sheets.map((s) => s.comment).filter(Boolean),
    };
  }
  const myCampuses = myTeam ? new Set(myTeam.members.map((m) => m.user.campusId ?? '')).size : 0;
  const finishers = submitted.flatMap((t) => t.members);

  return {
    challenge: {
      id: c.id, slug: c.slug, title: c.title, sdg: c.sdg, sdgName: sdgName(c.sdg), summary: c.summary, brief: c.brief, status: c.status,
      teamMin: c.teamMin, teamMax: c.teamMax, mixCampuses: c.mixCampuses, isPublic: c.isPublic, creditHours: c.creditHours,
      signupClosesAt: c.signupClosesAt, demoDayAt: c.demoDayAt, finishedAt: c.finishedAt, updatedAt: c.updatedAt,
      milestones, rubric,
      prizes: prizes.map((p) => ({ ...p, teamName: p.teamId ? nameOf.get(p.teamId) ?? null : null })),
      publicUrl: c.isPublic && c.status !== 'DRAFT' ? `/league/${c.slug}` : null,
    },
    me: {
      roles: [...roles], organizer, judge, mentor, minor,
      teamId: myTeam?.id ?? null, captain: !!myTeam?.members.find((m) => m.user.id === user.id)?.captain,
      submitProblem: myTeam && myTeam.status !== 'SUBMITTED' ? submitProblem({ members: myTeam.members.length, campuses: myCampuses, projectTitle: myTeam.projectTitle, pitch: myTeam.pitch }, c) : null,
      canJoin: user.role === 'STUDENT' && !roles.size && !myTeam && signupOpen(c),
    },
    people: people.map((p) => ({ role: p.role, id: p.user.id, name: p.user.name, avatar: p.user.avatar, campus: p.user.campus?.name ?? null })),
    teams: shownTeams,
    demo: { at: c.demoDayAt, open: c.status !== 'DRAFT' && demoOpen(c.demoDayAt), callId: leagueCallId(c.id) },
    ranking: ranking.map((r) => ({ ...r, name: nameOf.get(r.teamId) ?? '' })),
    feedback,
    ...(organizer ? {
      judging: { judges: people.filter((p) => p.role === 'JUDGE').length, submitted: submitted.length },
      credentials: { finishers: finishers.length, issued: finishers.filter((m) => m.certificateId && !m.certificateId.startsWith('pending:')).length },
    } : {}),
  };
}

/** PATCH /api/impact-league/:id: organizers change the challenge (after it's finished, only whether it's public). */
export async function updateChallenge(id: string, user: SessionUser, b: Body) {
  const ctx = await context(id, user);
  mustOrganize(ctx);
  const { c } = ctx;
  const data: Prisma.LeagueChallengeUpdateManyMutationInput = {};
  if (typeof b.isPublic === 'boolean') data.isPublic = b.isPublic;
  const rest = Object.keys(b).filter((k) => k !== 'isPublic' && k !== 'updatedAt');
  if (c.status === 'DONE' && rest.length) throw new BadRequestException('This challenge is finished. Only its public page can be turned on or off.');

  if ('title' in b) {
    const title = clip(b.title, 100);
    if (title.length < 4) throw new BadRequestException('Give the challenge a title (at least 4 characters).');
    data.title = title;
    // A draft's web address follows its title; once it's open, the address stays.
    const base = slugify(title);
    if (c.status === 'DRAFT' && c.slug !== base && !c.slug.startsWith(`${base}-`)) data.slug = await freeSlug(base);
  }
  if ('summary' in b) data.summary = clip(b.summary, 200);
  if ('brief' in b) data.brief = para(b.brief, 4000);
  if ('sdg' in b) data.sdg = b.sdg === null || b.sdg === '' ? null : validSdg(b.sdg);
  if ('mixCampuses' in b) data.mixCampuses = b.mixCampuses === true;
  if ('creditHours' in b) {
    const h = Math.round(Number(b.creditHours));
    if (!(h >= 0 && h <= 200)) throw new BadRequestException('Credential hours go from 0 to 200.');
    data.creditHours = h;
  }
  if ('teamMin' in b || 'teamMax' in b) {
    const min = 'teamMin' in b ? Math.round(Number(b.teamMin)) : c.teamMin, max = 'teamMax' in b ? Math.round(Number(b.teamMax)) : c.teamMax;
    if (!(min >= TEAM_SIZE.min && max <= TEAM_SIZE.max && min <= max)) throw new BadRequestException(`Teams can have ${TEAM_SIZE.min} to ${TEAM_SIZE.max} people, and the smallest size can’t be more than the biggest.`);
    if (max < c.teamMax) {
      const biggest = await prisma.leagueMember.groupBy({ by: ['teamId'], where: { challengeId: id }, _count: { _all: true }, orderBy: { _count: { teamId: 'desc' } }, take: 1 });
      if ((biggest[0]?._count._all ?? 0) > max) throw new BadRequestException(`A team already has ${biggest[0]._count._all} people.`);
    }
    data.teamMin = min; data.teamMax = max;
  }
  const when = (k: 'signupClosesAt' | 'demoDayAt') => {
    const v = isoOrNull(b[k]);
    if (b[k] && !v) throw new BadRequestException('That date isn’t valid.');
    return v ? new Date(v) : null;
  };
  if ('signupClosesAt' in b) data.signupClosesAt = when('signupClosesAt');
  if ('demoDayAt' in b) data.demoDayAt = when('demoDayAt');
  if ('milestones' in b) {
    const ms = parseMilestones(b.milestones);
    if (!ms.length) throw new BadRequestException('Add at least one milestone, each with a title.');
    data.milestones = JSON.stringify(ms);
  }
  if ('rubric' in b) {
    const rubric = parseRubric(b.rubric);
    if (!rubric) throw new BadRequestException('A rubric needs 1 to 8 criteria, each with a name and a top score from 1 to 10.');
    if (JSON.stringify(rubric) !== JSON.stringify(leagueRubric(parseJson(c.rubric))) && (await prisma.leagueScore.count({ where: { team: { challengeId: id } } }))) {
      throw new BadRequestException('Judges have started scoring, so the rubric can’t change now.');
    }
    data.rubric = JSON.stringify(rubric);
  }
  if ('prizes' in b) {
    // Winners are given with "award"; here only the prizes themselves change (a kept prize keeps its winner).
    const before = new Map(parsePrizes(parseJson(c.prizes)).map((p) => [p.id, p.teamId]));
    data.prizes = JSON.stringify(parsePrizes(b.prizes).map((p) => ({ ...p, teamId: before.get(p.id) ?? null })));
  }
  if (!Object.keys(data).length) return { ok: true };
  // Two organizers editing at once: the second is told to reload instead of overwriting the first.
  const { count } = await prisma.leagueChallenge.updateMany({ where: { id, updatedAt: c.updatedAt }, data: { ...data, updatedAt: new Date() } });
  if (!count) throw new ConflictException('Someone else just changed this challenge. Reload and try again.');
  await refresh(id);
  return { ok: true, slug: typeof data.slug === 'string' ? data.slug : c.slug };
}

/** DELETE /api/impact-league/:id: organizers delete a draft, or a challenge no team has joined. */
export async function deleteChallenge(id: string, user: SessionUser) {
  const ctx = await context(id, user);
  mustOrganize(ctx);
  if (ctx.c.status !== 'DRAFT' && (await prisma.leagueTeam.count({ where: { challengeId: id } }))) {
    throw new BadRequestException('Teams have joined this challenge. Finish it instead: finished challenges stay as a record.');
  }
  const ids = await everyone(id);
  await prisma.leagueChallenge.delete({ where: { id } });
  publish([...ids, user.id], { type: 'refresh', keys: ['/api/impact-league'] });
  return { ok: true };
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────

const ACTIONS = ['publish', 'judging', 'reopen', 'finish', 'add-person', 'remove-person', 'mentor', 'hide', 'remove-team', 'award', 'credentials', 'create-team', 'join', 'leave', 'remove-member', 'team', 'submit', 'score'] as const;

/** POST /api/impact-league/:id { action, … }: everything people do in a challenge. */
export async function leagueAction(id: string, user: SessionUser, b: Body, req?: Request) {
  if (!oneOf(ACTIONS, b.action)) throw new BadRequestException('Unknown action.');
  const ctx = await context(id, user);
  switch (b.action) {
    case 'publish': return setStatus(ctx, user, ['DRAFT'], 'OPEN');
    case 'reopen': return setStatus(ctx, user, ['JUDGING'], 'OPEN');
    case 'judging': return setStatus(ctx, user, ['OPEN'], 'JUDGING');
    case 'finish': return setStatus(ctx, user, ['JUDGING'], 'DONE');
    case 'add-person': return addPerson(ctx, user, b);
    case 'remove-person': return removePerson(ctx, user, b);
    case 'mentor': return setMentor(ctx, user, b);
    case 'hide': return hideTeam(ctx, b);
    case 'remove-team': return removeTeam(ctx, b);
    case 'award': return award(ctx, b);
    case 'credentials': return issueCredentials(ctx, user, req);
    case 'create-team': return createTeam(ctx, user, b);
    case 'join': return joinTeam(ctx, user, b);
    case 'leave': return leaveTeam(ctx, user);
    case 'remove-member': return removeMember(ctx, user, b);
    case 'team': return editTeam(ctx, user, b);
    case 'submit': return submitProject(ctx, user);
    case 'score': return scoreTeam(ctx, user, b);
  }
}

async function setStatus(ctx: Ctx, user: SessionUser, from: string[], to: 'OPEN' | 'JUDGING' | 'DONE') {
  mustOrganize(ctx);
  const { c } = ctx;
  if (to === 'OPEN' && c.status === 'DRAFT' && !parseMilestones(parseJson(c.milestones)).length) throw new BadRequestException('Add at least one milestone first.');
  const submitted = await prisma.leagueTeam.findMany({ where: { challengeId: c.id, status: 'SUBMITTED' }, select: { id: true } });
  if (to === 'JUDGING' && !submitted.length) throw new BadRequestException('No team has handed in a project yet.');
  const { count } = await prisma.leagueChallenge.updateMany({ where: { id: c.id, status: { in: from } }, data: { status: to, updatedAt: new Date(), ...(to === 'DONE' ? { finishedAt: new Date() } : {}) } });
  if (!count) throw new ConflictException('The challenge has already moved on. Reload to see where it is.');
  await refresh(c.id);

  const finishers = submitted.length ? (await prisma.leagueMember.findMany({ where: { challengeId: c.id, team: { status: 'SUBMITTED' } }, select: { userId: true, teamId: true }, take: 2000 })) : [];
  later(async () => {
    const link = pageOf(c.id);
    if (to === 'OPEN' && c.status === 'DRAFT') {
      const ids = (await prisma.leaguePerson.findMany({ where: { challengeId: c.id, userId: { not: user.id } }, select: { userId: true } })).map((p) => p.userId);
      if (ids.length) await notifyMany(ids, { type: 'event', title: `“${c.title}” is open`, body: 'Teams can sign up now.', link, email: false });
    }
    if (to === 'JUDGING') {
      const judges = await peopleWith(c.id, 'JUDGE');
      if (judges.length) await notifyMany(judges, { type: 'reminder', title: `Time to judge “${c.title}”`, body: `${submitted.length} ${submitted.length === 1 ? 'project is' : 'projects are'} waiting for your scores.`, link, email: false });
      if (finishers.length) await notifyMany(finishers.map((f) => f.userId), { type: 'event', title: `Judging has started: ${c.title}`, body: 'Your project is with the judges.', link, email: false });
    }
    if (to === 'DONE') {
      if (finishers.length) await notifyMany(finishers.map((f) => f.userId), { type: 'event', title: `Results are in: ${c.title}`, body: 'See the prizes and your judges’ feedback.', link, email: false });
      for (const p of parsePrizes(parseJson(c.prizes))) {
        const winners = finishers.filter((f) => f.teamId === p.teamId).map((f) => f.userId);
        if (winners.length) await notifyMany(winners, { type: 'event', title: `Your team won “${p.title}”`, body: `${c.title}${p.sponsor ? ` · from ${p.sponsor}` : ''}`, link, email: false });
      }
    }
  });
  return { ok: true, status: to };
}

async function addPerson(ctx: Ctx, user: SessionUser, b: Body) {
  mustOrganize(ctx);
  const { c } = ctx;
  if (!oneOf(LEAGUE_ROLES, b.role)) throw new BadRequestException('Pick a part: organizer, mentor, judge or sponsor.');
  const role = b.role;
  const email = clip(b.email, 200).toLowerCase();
  if (!email.includes('@')) throw new BadRequestException('Type their email address.');
  const who = await prisma.user.findFirst({ where: { email }, select: { id: true, name: true, role: true } });
  if (!who) throw new NotFoundException('Nobody with that email has a UniVerse account yet.');
  if (who.role === 'STUDENT' || who.role === 'GUARDIAN') throw new BadRequestException('Students take part in teams; parents can’t have a part. Add a staff member or mentor instead.');
  if (role === 'ORGANIZER' && who.role !== 'ADMIN' && who.role !== 'TEACHER') throw new BadRequestException('Organizers are admins or teachers.');
  if (await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: who.id } } })) throw new BadRequestException('They’re in a team in this challenge.');
  if ((await prisma.leaguePerson.count({ where: { challengeId: c.id } })) >= MAX_PEOPLE) throw new BadRequestException(`A challenge can have up to ${MAX_PEOPLE} organizers, mentors, judges and sponsors.`);
  const made = await prisma.leaguePerson.create({ data: { challengeId: c.id, userId: who.id, role } }).catch(() => null);
  if (!made) throw new ConflictException(`${who.name} is already a ${ROLE_LABEL[role].toLowerCase()} here.`);
  await refresh(c.id, [who.id]);
  if (who.id !== user.id) {
    const what = role === 'JUDGE' ? 'You’ll score the projects teams hand in.' : role === 'MENTOR' ? 'Pick a team to mentor, or wait for the organizers to match you.' : role === 'SPONSOR' ? 'You can follow every team and join demo day.' : 'You can run the challenge with the other organizers.';
    later(() => notifyMany([who.id], { type: 'event', title: `You’re a ${ROLE_LABEL[role].toLowerCase()} in “${c.title}”`, body: `${user.name} added you. ${what}`, link: pageOf(c.id), email: false }));
  }
  return { ok: true, person: { id: who.id, name: who.name, role } };
}

/** Takes someone out of a team's group, unless they're still in the team (mentors never are). */
async function leaveGroup(groupId: string | null, userId: string) {
  if (groupId) await prisma.groupMembership.deleteMany({ where: { groupId, userId } });
}

async function removePerson(ctx: Ctx, user: SessionUser, b: Body) {
  mustOrganize(ctx);
  const { c } = ctx;
  const userId = text(b.userId);
  if (!oneOf(LEAGUE_ROLES, b.role)) throw new BadRequestException('Pick a part.');
  const role = b.role;
  const row = await prisma.leaguePerson.findUnique({ where: { challengeId_userId_role: { challengeId: c.id, userId, role } } });
  if (!row) throw new NotFoundException('They don’t have that part here.');
  if (role === 'ORGANIZER' && !isAdmin(user) && (await prisma.leaguePerson.count({ where: { challengeId: c.id, role: 'ORGANIZER' } })) <= 1) {
    throw new BadRequestException('A challenge needs at least one organizer. Add another first.');
  }
  await prisma.leaguePerson.delete({ where: { id: row.id } });
  if (role === 'MENTOR') {
    const teams = await prisma.leagueTeam.findMany({ where: { challengeId: c.id, mentorId: userId }, select: { groupId: true } });
    for (const t of teams) await leaveGroup(t.groupId, userId);
    if (teams.length) await prisma.leagueTeam.updateMany({ where: { challengeId: c.id, mentorId: userId }, data: { mentorId: null } });
  }
  // A judge taken off before the results: their scores no longer count.
  if (role === 'JUDGE' && c.status !== 'DONE') await prisma.leagueScore.deleteMany({ where: { judgeId: userId, team: { challengeId: c.id } } });
  await refresh(c.id, [userId]);
  return { ok: true };
}

async function teamIn(challengeId: string, teamId: unknown) {
  const t = typeof teamId === 'string' ? await prisma.leagueTeam.findFirst({ where: { id: teamId, challengeId } }) : null;
  if (!t) throw new NotFoundException('That team isn’t in this challenge any more.');
  return t;
}

async function setMentor(ctx: Ctx, user: SessionUser, b: Body) {
  const { c, roles, organizer } = ctx;
  const team = await teamIn(c.id, b.teamId);
  const mentorId = b.mentorId === null || b.mentorId === '' ? null : str(b.mentorId) ?? null;
  const volunteering = roles.has('MENTOR') && mentorId === user.id && !team.mentorId;
  const steppingDown = mentorId === null && team.mentorId === user.id;
  if (!organizer && !volunteering && !steppingDown) throw new ForbiddenException(team.mentorId && mentorId === user.id ? 'This team already has a mentor.' : 'Only organizers match mentors to teams.');
  if (mentorId && !(await prisma.leaguePerson.findUnique({ where: { challengeId_userId_role: { challengeId: c.id, userId: mentorId, role: 'MENTOR' } } }))) {
    throw new BadRequestException('Add them as a mentor first.');
  }
  if (team.mentorId === mentorId) return { ok: true };
  if (team.mentorId) await leaveGroup(team.groupId, team.mentorId);
  if (mentorId && team.groupId) {
    await prisma.groupMembership.upsert({ where: { groupId_userId: { groupId: team.groupId, userId: mentorId } }, create: { groupId: team.groupId, userId: mentorId, role: 'MODERATOR' }, update: { role: 'MODERATOR' } });
  }
  await prisma.leagueTeam.update({ where: { id: team.id }, data: { mentorId } });
  await refresh(c.id);
  if (mentorId) {
    const mentor = await prisma.user.findUnique({ where: { id: mentorId }, select: { name: true } });
    const members = await teamMembers(team.id);
    later(async () => {
      await notifyMany(members, { type: 'event', title: `${mentor?.name ?? 'A mentor'} is mentoring ${team.name}`, body: `${c.title}: they’re in your team’s group now.`, link: pageOf(c.id), email: false });
      if (mentorId !== user.id) await notifyMany([mentorId], { type: 'event', title: `You’re mentoring ${team.name}`, body: `${c.title}: you’re in the team’s group and can see its board.`, link: pageOf(c.id), email: false });
    });
  }
  return { ok: true };
}

async function hideTeam(ctx: Ctx, b: Body) {
  mustOrganize(ctx);
  const team = await teamIn(ctx.c.id, b.teamId);
  await prisma.leagueTeam.update({ where: { id: team.id }, data: { hidden: b.hidden === true } });
  await refresh(ctx.c.id);
  return { ok: true };
}

/** A team's workspace goes with it: its group (posts, members) and its board (lists, cards). */
async function dropWorkspace(t: { groupId: string | null; boardId: string | null }) {
  if (t.boardId) await prisma.taskBoard.deleteMany({ where: { id: t.boardId } });
  if (t.groupId) await prisma.group.deleteMany({ where: { id: t.groupId } });
}

async function removeTeam(ctx: Ctx, b: Body) {
  mustOrganize(ctx);
  const { c } = ctx;
  if (c.status === 'DONE') throw new BadRequestException('The challenge is finished; its teams stay as a record. Hide the team from the public page instead.');
  const team = await teamIn(c.id, b.teamId);
  const members = await teamMembers(team.id);
  await prisma.leagueTeam.delete({ where: { id: team.id } });
  await dropWorkspace(team);
  await refresh(c.id, members);
  later(() => notifyMany(members, { type: 'event', title: `${team.name} was removed from “${c.title}”`, body: 'The challenge’s organizers removed your team. Ask them if you’re not sure why.', link: pageOf(c.id), email: false }));
  return { ok: true };
}

async function award(ctx: Ctx, b: Body) {
  mustOrganize(ctx);
  const { c } = ctx;
  if (c.status !== 'JUDGING' && c.status !== 'DONE') throw new BadRequestException('Prizes are given once judging has started.');
  const prizes = parsePrizes(parseJson(c.prizes));
  const prize = prizes.find((p) => p.id === b.prizeId);
  if (!prize) throw new NotFoundException('That prize isn’t there any more.');
  let teamId: string | null = null;
  if (b.teamId) {
    const team = await teamIn(c.id, b.teamId);
    if (team.status !== 'SUBMITTED') throw new BadRequestException('Only teams that handed in a project can win.');
    teamId = team.id;
  }
  const next: Prize[] = prizes.map((p) => (p.id === prize.id ? { ...p, teamId } : p));
  const { count } = await prisma.leagueChallenge.updateMany({ where: { id: c.id, updatedAt: c.updatedAt }, data: { prizes: JSON.stringify(next), updatedAt: new Date() } });
  if (!count) throw new ConflictException('Someone else just changed this challenge. Reload and try again.');
  await refresh(c.id);
  // After the results, a winner hears at once (before then, when the challenge is finished).
  if (c.status === 'DONE' && teamId && teamId !== prize.teamId) {
    const winners = await teamMembers(teamId);
    later(() => notifyMany(winners, { type: 'event', title: `Your team won “${prize.title}”`, body: `${c.title}${prize.sponsor ? ` · from ${prize.sponsor}` : ''}`, link: pageOf(c.id), email: false }));
  }
  return { ok: true };
}

/**
 * POST { action: 'credentials' }: signed credentials for finishers (members of teams that handed in),
 * 20 at a time; the page calls again while some remain. Each person's row is claimed first, so two
 * organizers pressing at once can't issue twice.
 */
async function issueCredentials(ctx: Ctx, user: SessionUser, req?: Request) {
  mustOrganize(ctx);
  const { c } = ctx;
  if (c.status !== 'DONE') throw new BadRequestException('Finish the challenge first.');
  const { impactService } = await import('./services/impact.service');
  const { evidenceFromCredential, safely } = await import('./skill-evidence');
  // A claim left by an attempt that stopped halfway (over 10 minutes old) is let go first.
  const claims = await prisma.leagueMember.findMany({ where: { challengeId: c.id, certificateId: { startsWith: 'pending:' } }, select: { id: true, certificateId: true }, take: 500 });
  const stale = claims.filter((m) => Number(m.certificateId!.split(':')[1]) < Date.now() - 10 * 60_000).map((m) => m.id);
  for (const ids of chunks(stale)) await prisma.leagueMember.updateMany({ where: { id: { in: ids } }, data: { certificateId: null } });
  const where = { challengeId: c.id, certificateId: null, team: { status: 'SUBMITTED' } };
  const batch = await prisma.leagueMember.findMany({ where, take: CREDENTIALS_PER_CALL, select: { id: true, userId: true, team: { select: { id: true, name: true, projectTitle: true } } } });
  const prizes = parsePrizes(parseJson(c.prizes));
  const goal = c.sdg ? ` (UN goal ${c.sdg}: ${sdgName(c.sdg)})` : '';
  let issued = 0, failed = 0;
  const done: string[] = [];
  for (const m of batch) {
    const claim = `pending:${Date.now()}:${crypto.randomUUID()}`;
    const { count } = await prisma.leagueMember.updateMany({ where: { id: m.id, certificateId: null }, data: { certificateId: claim } });
    if (!count) continue;
    try {
      const won = prizes.filter((p) => p.teamId === m.team.id).map((p) => p.title);
      const project = m.team.projectTitle || m.team.name;
      const cert = await impactService.issueCredentialDirect({ id: user.id, name: user.name }, {
        studentId: m.userId,
        title: `Impact League finisher · ${c.title}`.slice(0, 120),
        projectName: project.slice(0, 160),
        organization: 'UniVerse Impact League',
        hoursCompleted: c.creditHours,
        peopleImpacted: 0,
        description: `With the team ${m.team.name}, took part in the Impact League challenge “${c.title}”${goal} and handed in “${project}”.${won.length ? ` Prize: ${won.join(', ')}.` : ''}`.slice(0, 2000),
        ...(c.isPublic ? { evidenceUrl: `${publicAppUrl()}/league/${c.slug}` } : {}),
      });
      const certId = (cert as { id?: string } | null)?.id;
      if (!certId) throw new Error('no credential id');
      await prisma.leagueMember.update({ where: { id: m.id }, data: { certificateId: certId } });
      await safely(evidenceFromCredential(certId)); // proof of learning (upgrade 2)
      issued++;
      done.push(m.userId);
    } catch (e) {
      console.error('league credential failed:', e);
      await prisma.leagueMember.updateMany({ where: { id: m.id, certificateId: claim }, data: { certificateId: null } });
      failed++;
    }
  }
  const remaining = await prisma.leagueMember.count({ where });
  if (issued) {
    audit(user, { action: 'credential.issued', summary: `Issued ${issued} Impact League credential${issued === 1 ? '' : 's'} for “${c.title}”`, targetType: 'league', targetId: c.id }, req);
    later(() => notifyMany(done, { type: 'credential', title: 'You have a new verified credential', body: `Impact League finisher · ${c.title}. Share it from your skills passport.`, link: '/student/credentials', email: false }));
    await refresh(c.id);
  }
  return { issued, failed, remaining };
}

// ── Teams ────────────────────────────────────────────────────────────────────────────────────────

/** Whether this person may be in a team here now (a student, sign-up open, no part in running it). */
function mayTeamUp(ctx: Ctx, user: SessionUser) {
  if (user.role !== 'STUDENT') throw new ForbiddenException('Teams are for students.');
  if (!signupOpen(ctx.c)) throw new BadRequestException(ctx.c.status === 'OPEN' ? 'Sign-up has closed for this challenge.' : 'This challenge isn’t taking teams right now.');
  if (ctx.roles.size) throw new BadRequestException('You help run this challenge, so you can’t be in a team.');
}

async function nameTaken(challengeId: string, name: string, exceptId?: string) {
  const names = await prisma.leagueTeam.findMany({ where: { challengeId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true }, take: MAX_TEAMS + 10 });
  return names.some((t) => t.name.toLowerCase() === name.toLowerCase());
}

async function createTeam(ctx: Ctx, user: SessionUser, b: Body) {
  mayTeamUp(ctx, user);
  const { c } = ctx;
  const name = clip(b.name, 40);
  if (name.length < 2) throw new BadRequestException('Give your team a name.');
  if (await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: user.id } } })) throw new ConflictException('You’re already in a team in this challenge.');
  if ((await prisma.leagueTeam.count({ where: { challengeId: c.id } })) >= MAX_TEAMS) throw new BadRequestException('This challenge is full.');
  if (await nameTaken(c.id, name)) throw new ConflictException('Another team has that name. Pick another one.');

  const team = await prisma.leagueTeam.create({ data: { challengeId: c.id, name, lookingFor: clip(b.lookingFor, 200) } }).catch(() => null);
  if (!team) throw new ConflictException('Another team has that name. Pick another one.');
  const joined = await prisma.leagueMember.create({ data: { challengeId: c.id, teamId: team.id, userId: user.id, captain: true } }).catch(() => null);
  if (!joined) {
    await prisma.leagueTeam.delete({ where: { id: team.id } });
    throw new ConflictException('You’re already in a team in this challenge.');
  }

  // The team's workspace: a private group, and a board with the milestones as cards.
  const group = await prisma.group.create({
    data: { name: `${name} · ${c.title}`.slice(0, 80), description: `Impact League team for “${c.title}”.`, category: 'Impact League', isPublic: false, createdById: user.id, members: { create: { userId: user.id, role: 'ADMIN' } } },
    select: { id: true },
  });
  const board = await prisma.taskBoard.create({ data: { title: `${name} · Milestones`.slice(0, 80), ownerId: user.id, groupId: group.id }, select: { id: true } });
  await prisma.taskList.createMany({ data: ['To do', 'Doing', 'Done'].map((t, i) => ({ boardId: board.id, title: t, position: i + 1 })) });
  const todo = await prisma.taskList.findFirst({ where: { boardId: board.id }, orderBy: { position: 'asc' }, select: { id: true } });
  const rows = parseMilestones(parseJson(c.milestones)).map((m, i) => ({
    boardId: board.id, listId: todo!.id, title: m.title, notes: m.notes || null, dueAt: m.dueAt ? new Date(m.dueAt) : null,
    labels: JSON.stringify(['Milestone']), position: i + 1, createdById: user.id,
  }));
  // About 11 values a card: 8 cards per insert stays under D1's 100 bound values.
  for (let i = 0; i < rows.length; i += 8) await prisma.task.createMany({ data: rows.slice(i, i + 8) });
  await prisma.leagueTeam.update({ where: { id: team.id }, data: { groupId: group.id, boardId: board.id } });
  await refresh(c.id, [user.id]);
  return { ok: true, teamId: team.id, groupId: group.id, boardId: board.id };
}

async function joinTeam(ctx: Ctx, user: SessionUser, b: Body) {
  mayTeamUp(ctx, user);
  const { c } = ctx;
  const team = await teamIn(c.id, b.teamId);
  if (await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: user.id } } })) throw new ConflictException('You’re already in a team in this challenge. Leave it first.');
  const members = await prisma.leagueMember.findMany({ where: { teamId: team.id }, select: { userId: true, user: { select: { campusId: true } } } });
  if (members.length >= c.teamMax) throw new BadRequestException('This team is full.');
  // Students under 18 team up within their own university.
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { campusId: true } });
  const minors = await minorsAmong([...members.map((m) => m.userId), user.id]);
  const people = [...members.map((m) => ({ campusId: m.user.campusId, minor: minors.has(m.userId) })), { campusId: me?.campusId ?? null, minor: minors.has(user.id) }];
  if (!campusMixAllowed(people)) {
    throw new BadRequestException(minors.has(user.id) ? 'Students under 18 team up within their own university. Pick a team from your university, or start one.' : 'Someone in this team is under 18, so it stays within one university. Pick another team, or start one.');
  }
  const joined = await prisma.leagueMember.create({ data: { challengeId: c.id, teamId: team.id, userId: user.id } }).catch(() => null);
  if (!joined) throw new ConflictException('You’re already in a team in this challenge.');
  // Two people taking the last seat at once: the later one steps back out.
  if ((await prisma.leagueMember.count({ where: { teamId: team.id } })) > c.teamMax) {
    await prisma.leagueMember.delete({ where: { id: joined.id } });
    throw new BadRequestException('This team just filled up.');
  }
  if (team.groupId) await prisma.groupMembership.upsert({ where: { groupId_userId: { groupId: team.groupId, userId: user.id } }, create: { groupId: team.groupId, userId: user.id }, update: {} });
  await refresh(c.id, [user.id]);
  later(() => notifyMany(members.map((m) => m.userId), { type: 'event', title: `${user.name} joined ${team.name}`, body: c.title, link: pageOf(c.id), email: false }));
  return { ok: true, teamId: team.id };
}

/** Someone leaves a team (or is removed): a new captain if needed, back to forming if it's now too small, and an empty team is deleted. */
async function dropMember(c: Challenge, m: { id: string; userId: string; captain: boolean; teamId: string }) {
  const team = await prisma.leagueTeam.findUnique({ where: { id: m.teamId } });
  await prisma.leagueMember.delete({ where: { id: m.id } });
  if (!team) return [];
  await leaveGroup(team.groupId, m.userId);
  const rest = await prisma.leagueMember.findMany({ where: { teamId: team.id }, orderBy: { joinedAt: 'asc' }, select: { id: true, userId: true, captain: true } });
  if (!rest.length) {
    await prisma.leagueTeam.delete({ where: { id: team.id } });
    await dropWorkspace(team);
    return [];
  }
  if (m.captain && !rest.some((r) => r.captain)) {
    await prisma.leagueMember.update({ where: { id: rest[0].id }, data: { captain: true } });
    if (team.groupId) await prisma.groupMembership.updateMany({ where: { groupId: team.groupId, userId: rest[0].userId }, data: { role: 'ADMIN' } });
  }
  if (team.status === 'SUBMITTED' && rest.length < c.teamMin) await prisma.leagueTeam.update({ where: { id: team.id }, data: { status: 'FORMING', submittedAt: null } });
  return rest.map((r) => r.userId);
}

async function leaveTeam(ctx: Ctx, user: SessionUser) {
  const { c } = ctx;
  const m = await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: user.id } }, select: { id: true, userId: true, captain: true, teamId: true, team: { select: { name: true } } } });
  if (!m) throw new NotFoundException('You’re not in a team in this challenge.');
  if (c.status !== 'OPEN') throw new BadRequestException('Teams are fixed once judging starts.');
  const rest = await dropMember(c, m);
  await refresh(c.id, [user.id]);
  if (rest.length) later(() => notifyMany(rest, { type: 'event', title: `${user.name} left ${m.team.name}`, body: c.title, link: pageOf(c.id), email: false }));
  return { ok: true };
}

async function removeMember(ctx: Ctx, user: SessionUser, b: Body) {
  const { c, organizer } = ctx;
  const userId = text(b.userId);
  if (userId === user.id) throw new BadRequestException('To leave your team, use Leave team.');
  const m = await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId } }, select: { id: true, userId: true, captain: true, teamId: true, team: { select: { name: true } } } });
  if (!m) throw new NotFoundException('They’re not in a team here any more.');
  const captain = await prisma.leagueMember.findFirst({ where: { teamId: m.teamId, userId: user.id, captain: true }, select: { id: true } });
  if (!organizer && !captain) throw new ForbiddenException('Only the team’s captain or the organizers can remove someone.');
  if (c.status !== 'OPEN') throw new BadRequestException('Teams are fixed once judging starts.');
  const rest = await dropMember(c, m);
  await refresh(c.id, [userId]);
  later(() => notifyMany([userId], { type: 'event', title: `You’re no longer in ${m.team.name}`, body: `${c.title}: ${organizer && !captain ? 'the organizers' : 'your captain'} took you off the team. You can join or start another team while sign-up is open.`, link: pageOf(c.id), email: false }));
  return { ok: true, members: rest.length };
}

async function myMembership(c: Challenge, user: SessionUser) {
  const m = await prisma.leagueMember.findUnique({ where: { challengeId_userId: { challengeId: c.id, userId: user.id } }, select: { teamId: true, captain: true } });
  if (!m) throw new NotFoundException('You’re not in a team in this challenge.');
  return m;
}

/** POST { action: 'team', name?, lookingFor?, projectTitle?, pitch?, link?, showcase? }: the team edits itself. */
async function editTeam(ctx: Ctx, user: SessionUser, b: Body) {
  const { c } = ctx;
  const m = await myMembership(c, user);
  const team = await teamIn(c.id, m.teamId);
  const data: { name?: string; lookingFor?: string; projectTitle?: string; pitch?: string; link?: string; showcase?: boolean } = {};
  if (typeof b.showcase === 'boolean') data.showcase = b.showcase; // the team's choice, any time
  const edits = ['name', 'lookingFor', 'projectTitle', 'pitch', 'link'].filter((k) => k in b);
  if (edits.length && c.status !== 'OPEN') throw new BadRequestException('Projects can be changed while the challenge is open.');
  if ('name' in b) {
    const name = clip(b.name, 40);
    if (name.length < 2) throw new BadRequestException('Give your team a name.');
    if (name !== team.name && (await nameTaken(c.id, name, team.id))) throw new ConflictException('Another team has that name. Pick another one.');
    data.name = name;
  }
  if ('lookingFor' in b) data.lookingFor = clip(b.lookingFor, 200);
  if ('projectTitle' in b) data.projectTitle = clip(b.projectTitle, 100);
  if ('pitch' in b) data.pitch = para(b.pitch, 3000);
  if ('link' in b) {
    const link = cleanLink(b.link);
    if (link === null) throw new BadRequestException('Use a full web address starting with https://');
    data.link = link;
  }
  if (!Object.keys(data).length) return { ok: true };
  const saved = await prisma.leagueTeam.update({ where: { id: team.id }, data }).catch(() => null);
  if (!saved) throw new ConflictException('Another team has that name. Pick another one.');
  if (data.name && team.groupId) await prisma.group.updateMany({ where: { id: team.groupId }, data: { name: `${data.name} · ${c.title}`.slice(0, 80) } });
  await refresh(c.id);
  return { ok: true };
}

async function submitProject(ctx: Ctx, user: SessionUser) {
  const { c } = ctx;
  if (c.status !== 'OPEN') throw new BadRequestException('Projects are handed in while the challenge is open.');
  const m = await myMembership(c, user);
  const team = await teamIn(c.id, m.teamId);
  if (team.status === 'SUBMITTED') return { ok: true };
  const members = await prisma.leagueMember.findMany({ where: { teamId: team.id }, select: { userId: true, user: { select: { campusId: true } } } });
  const problem = submitProblem({ members: members.length, campuses: new Set(members.map((x) => x.user.campusId ?? '')).size, projectTitle: team.projectTitle, pitch: team.pitch }, c);
  if (problem) throw new BadRequestException(problem);
  await prisma.leagueTeam.updateMany({ where: { id: team.id, status: 'FORMING' }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  await refresh(c.id);
  const others = [...members.map((x) => x.userId).filter((id) => id !== user.id), ...(team.mentorId ? [team.mentorId] : [])];
  if (others.length) later(() => notifyMany(others, { type: 'event', title: `${team.name} handed in “${team.projectTitle}”`, body: `${c.title}: you can still improve it until judging starts.`, link: pageOf(c.id), email: false }));
  return { ok: true };
}

/** POST { action: 'score', teamId, scores: [{ id, score }], comment }: a judge scores a handed-in project. */
async function scoreTeam(ctx: Ctx, user: SessionUser, b: Body) {
  const { c, roles } = ctx;
  if (!roles.has('JUDGE')) throw new ForbiddenException('Only this challenge’s judges score projects.');
  if (c.status !== 'JUDGING') throw new BadRequestException('Scoring is open while the challenge is being judged.');
  const team = await teamIn(c.id, b.teamId);
  if (team.status !== 'SUBMITTED') throw new BadRequestException('This team didn’t hand in a project.');
  if (team.mentorId === user.id) throw new BadRequestException('You mentored this team, so the other judges score it.');
  const rubric = leagueRubric(parseJson(c.rubric));
  const scores = cleanJudgeScores(b.scores, rubric);
  if (!scores) throw new BadRequestException('Give every criterion a score.');
  const total = scores.reduce((n, s) => n + s.score, 0);
  const data = { scores: JSON.stringify(scores), total, comment: para(b.comment, 1000) };
  await prisma.leagueScore.upsert({ where: { teamId_judgeId: { teamId: team.id, judgeId: user.id } }, create: { teamId: team.id, judgeId: user.id, ...data }, update: { ...data, updatedAt: new Date() } });
  publish([...(await peopleWith(c.id, 'ORGANIZER')), user.id], { type: 'refresh', keys: [`/api/impact-league/${c.id}`] });
  return { ok: true, total };
}

// ── Demo day and the public page ─────────────────────────────────────────────────────────────────

/** Demo day's call (lg_<challenge>): organizers host any time; anyone signed in watches while it's on. */
export async function leagueCallAccess(challengeId: string, user: SessionUser) {
  const c = await prisma.leagueChallenge.findUnique({ where: { id: challengeId }, select: { id: true, title: true, status: true, demoDayAt: true } });
  if (!c || c.status === 'DRAFT') throw new NotFoundException('This demo day doesn’t exist.');
  const host = isAdmin(user) || !!(await prisma.leaguePerson.findUnique({ where: { challengeId_userId_role: { challengeId, userId: user.id, role: 'ORGANIZER' } }, select: { id: true } }));
  if (!host && !demoOpen(c.demoDayAt)) throw new HttpException(c.demoDayAt ? 'Demo day opens 15 minutes before it starts.' : 'Demo day hasn’t been planned yet.', 410);
  return { title: `Demo day · ${c.title}`, host };
}

/**
 * GET /api/league/:slug (no sign-in): the public showcase. The challenge, its prizes (winners once
 * it's finished), and the teams that handed in and chose to appear: names, universities, projects.
 * Never people's names, and nothing from a draft or a challenge whose organizers turned it off.
 */
export async function publicShowcase(slug: string) {
  const c = await prisma.leagueChallenge.findUnique({ where: { slug } });
  if (!c || c.status === 'DRAFT' || !c.isPublic) return null;
  const teams = await prisma.leagueTeam.findMany({
    where: { challengeId: c.id }, orderBy: { submittedAt: 'asc' }, take: MAX_TEAMS,
    select: { id: true, name: true, projectTitle: true, pitch: true, link: true, showcase: true, hidden: true, status: true, members: { select: { user: { select: { campus: { select: { name: true } } } } } } },
  });
  const done = c.status === 'DONE';
  const prizes = parsePrizes(parseJson(c.prizes), new Set(teams.map((t) => t.id)));
  const shown = teams.filter((t) => t.status === 'SUBMITTED' && t.showcase && !t.hidden);
  const shownIds = new Set(shown.map((t) => t.id));
  const campuses = (t: (typeof teams)[number]) => [...new Set(t.members.map((m) => m.user.campus?.name).filter((n): n is string => !!n))];
  return {
    slug: c.slug, title: c.title, sdg: c.sdg, sdgName: sdgName(c.sdg), summary: c.summary, brief: c.brief, status: c.status,
    demoDayAt: c.demoDayAt, finishedAt: c.finishedAt,
    stats: {
      teams: teams.length,
      universities: new Set(teams.flatMap(campuses)).size,
      finishers: teams.filter((t) => t.status === 'SUBMITTED').reduce((n, t) => n + t.members.length, 0),
    },
    sponsors: [...new Set(prizes.map((p) => p.sponsor).filter(Boolean))],
    prizes: prizes.map((p) => ({ title: p.title, sponsor: p.sponsor, description: p.description, winner: done && p.teamId && shownIds.has(p.teamId) ? teams.find((t) => t.id === p.teamId)!.name : null })),
    teams: shown.map((t) => ({
      name: t.name, universities: campuses(t), size: t.members.length,
      project: { title: t.projectTitle, pitch: t.pitch, link: t.link },
      prizes: done ? prizes.filter((p) => p.teamId === t.id).map((p) => p.title) : [],
    })),
  };
}
