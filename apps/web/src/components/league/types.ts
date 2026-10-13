import type { Criterion } from '@/lib/oral';
import type { JudgeScore, LeagueRole, LeagueStatus, Milestone, Prize } from '@/lib/impact-league';

// What GET /api/impact-league/:id returns (src/server/impact-league.ts challengeDetail).

export interface LeagueMemberView { id: string; name: string; avatar: string | null; campus: string | null; captain: boolean; credential?: boolean }
export interface LeagueTeamView {
  id: string; name: string; lookingFor: string; status: 'FORMING' | 'SUBMITTED'; submittedAt: string | null;
  mine: boolean; mentoring: boolean; mentor: { id: string; name: string } | null; seats: number; campuses: number;
  members: LeagueMemberView[]; progress: { done: number; total: number };
  project: { title: string; pitch: string; link: string } | null;
  groupId?: string | null; boardId?: string | null; showcase?: boolean; hidden?: boolean; judged?: number;
  myScore?: { scores: JudgeScore[]; comment: string; total: number } | null;
}
export interface LeagueDetail {
  challenge: {
    id: string; slug: string; title: string; sdg: number | null; sdgName: string | null; summary: string; brief: string; status: LeagueStatus;
    teamMin: number; teamMax: number; mixCampuses: boolean; isPublic: boolean; creditHours: number;
    signupClosesAt: string | null; demoDayAt: string | null; finishedAt: string | null; updatedAt: string;
    milestones: Milestone[]; rubric: Criterion[]; prizes: (Prize & { teamName: string | null })[]; publicUrl: string | null;
  };
  me: { roles: LeagueRole[]; organizer: boolean; judge: boolean; mentor: boolean; minor: boolean; teamId: string | null; captain: boolean; submitProblem: string | null; canJoin: boolean };
  people: { role: LeagueRole; id: string; name: string; avatar: string | null; campus: string | null }[];
  teams: LeagueTeamView[];
  demo: { at: string | null; open: boolean; callId: string };
  ranking: { teamId: string; name: string; average: number | null; judges: number; rank: number | null }[];
  feedback: { judges: number; criteria: { id: string; name: string; max: number; average: number | null }[]; comments: string[] } | null;
  judging?: { judges: number; submitted: number };
  credentials?: { finishers: number; issued: number };
}

/** Sends one action to the challenge; resolves true when it worked (the caller shows the toast). */
export type LeagueAct = (body: Record<string, unknown>, ok?: string) => Promise<boolean>;
