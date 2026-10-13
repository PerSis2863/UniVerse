import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUBRIC, campusMixAllowed, cleanJudgeScores, cleanLink, criterionAverages, defaultMilestones, demoOpen, leagueRubric, parseMilestones,
  parsePrizes, rankTeams, sdgName, signupOpen, slugify, submitProblem, validSdg,
} from './impact-league';

describe('Impact League rules (Stage 5 · D14)', () => {
  it('names the UN goals and makes web addresses from titles', () => {
    expect(sdgName(6)).toBe('Clean water and sanitation');
    expect(sdgName(18)).toBeNull();
    expect(validSdg('13')).toBe(13);
    expect(validSdg(0)).toBeNull();
    expect(slugify('Clean water ideas: Spring 2027!')).toBe('clean-water-ideas-spring-2027');
    expect(slugify('Énergie propre')).toBe('energie-propre');
    expect(slugify('???')).toBe('challenge');
    expect(slugify('x'.repeat(80))).toHaveLength(48);
  });

  it('keeps milestones tidy: titles needed, at most 8, unique ids, real dates', () => {
    expect(parseMilestones('nope')).toEqual([]);
    const ms = parseMilestones([
      { id: 'm1', title: '  Meet   the team ', notes: 'Hi', dueAt: '2026-11-01T10:00:00Z' },
      { id: 'm1', title: 'Research', dueAt: 'soon' },
      { title: 'x' },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `Step ${i}` })),
    ]);
    expect(ms).toHaveLength(7); // the first 8 entries, minus the one without a real title
    expect(ms[0]).toEqual({ id: 'm1', title: 'Meet the team', notes: 'Hi', dueAt: '2026-11-01T10:00:00.000Z' });
    expect(ms[1].id).not.toBe('m1');
    expect(ms[1].dueAt).toBeNull();
    expect(new Set(ms.map((m) => m.id)).size).toBe(ms.length);
    expect(defaultMilestones()).toHaveLength(4);
  });

  it('keeps a prize winner only when it is one of the challenge’s teams', () => {
    const prizes = parsePrizes([{ id: 'p1', title: 'Best idea', sponsor: 'Acme', teamId: 't1' }, { title: 'Runner-up', teamId: 'ghost' }, { sponsor: 'No title' }], new Set(['t1']));
    expect(prizes).toEqual([
      { id: 'p1', title: 'Best idea', sponsor: 'Acme', description: '', teamId: 't1' },
      { id: 'p2', title: 'Runner-up', sponsor: '', description: '', teamId: null },
    ]);
  });

  it('takes a judge’s scores only when every criterion has a whole number in range', () => {
    const rubric = DEFAULT_RUBRIC.slice(0, 2);
    expect(cleanJudgeScores([{ id: 'impact', score: 7.6 }, { id: 'evidence', score: 4 }], rubric)).toEqual([{ id: 'impact', score: 8 }, { id: 'evidence', score: 4 }]);
    expect(cleanJudgeScores([{ id: 'impact', score: 7 }], rubric)).toBeNull();
    expect(cleanJudgeScores([{ id: 'impact', score: 11 }, { id: 'evidence', score: 4 }], rubric)).toBeNull();
    expect(cleanJudgeScores('7', rubric)).toBeNull();
    expect(leagueRubric(null)).toBe(DEFAULT_RUBRIC);
    expect(leagueRubric([{ name: 'Impact', max: 5 }])).toEqual([{ id: 'impact', name: 'Impact', desc: '', max: 5 }]);
  });

  it('ranks teams by their average across judges; ties share a place, unscored teams come last', () => {
    const ranked = rankTeams(['a', 'b', 'c', 'd'], [
      { teamId: 'a', total: 30 }, { teamId: 'a', total: 40 },
      { teamId: 'b', total: 35 },
      { teamId: 'c', total: 41 },
      { teamId: 'x', total: 50 },
    ]);
    expect(ranked).toEqual([
      { teamId: 'c', average: 41, judges: 1, rank: 1 },
      { teamId: 'a', average: 35, judges: 2, rank: 2 },
      { teamId: 'b', average: 35, judges: 1, rank: 2 },
      { teamId: 'd', average: null, judges: 0, rank: null },
    ]);
    expect(criterionAverages(DEFAULT_RUBRIC.slice(0, 2), [[{ id: 'impact', score: 6 }, { id: 'evidence', score: 3 }], [{ id: 'impact', score: 7 }]])).toEqual([
      { id: 'impact', name: 'Impact', max: 10, average: 6.5 },
      { id: 'evidence', name: 'Evidence', max: 10, average: 3 },
    ]);
  });

  it('keeps teams with someone under 18 within one university', () => {
    expect(campusMixAllowed([{ campusId: 'a', minor: false }, { campusId: 'b', minor: false }])).toBe(true);
    expect(campusMixAllowed([{ campusId: 'a', minor: true }, { campusId: 'a', minor: false }])).toBe(true);
    expect(campusMixAllowed([{ campusId: 'a', minor: true }, { campusId: 'b', minor: false }])).toBe(false);
    expect(campusMixAllowed([{ campusId: null, minor: false }, { campusId: 'b', minor: true }])).toBe(false);
  });

  it('says what a team still needs before handing in', () => {
    const c = { teamMin: 2, mixCampuses: true };
    const ready = { members: 3, campuses: 2, projectTitle: 'Tap map', pitch: 'We mapped every safe tap near campus and who fixes them.' };
    expect(submitProblem(ready, c)).toBeNull();
    expect(submitProblem({ ...ready, members: 1 }, c)).toMatch(/at least 2 people/);
    expect(submitProblem({ ...ready, campuses: 1 }, c)).toMatch(/two universities/);
    expect(submitProblem({ ...ready, campuses: 1 }, { ...c, mixCampuses: false })).toBeNull();
    expect(submitProblem({ ...ready, projectTitle: ' ' }, c)).toMatch(/title/);
    expect(submitProblem({ ...ready, pitch: 'Short.' }, c)).toMatch(/few sentences/);
  });

  it('accepts only https links, and knows when sign-up and demo day are open', () => {
    expect(cleanLink('')).toBe('');
    expect(cleanLink('https://example.org/demo')).toBe('https://example.org/demo');
    expect(cleanLink('http://example.org')).toBeNull();
    expect(cleanLink('javascript:alert(1)')).toBeNull();
    expect(cleanLink('https://user:pw@example.org')).toBeNull();
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(signupOpen({ status: 'OPEN', signupClosesAt: null }, now)).toBe(true);
    expect(signupOpen({ status: 'OPEN', signupClosesAt: '2026-10-13T11:00:00Z' }, now)).toBe(false);
    expect(signupOpen({ status: 'JUDGING', signupClosesAt: null }, now)).toBe(false);
    expect(demoOpen('2026-10-13T12:10:00Z', now)).toBe(true);
    expect(demoOpen('2026-10-13T12:30:00Z', now)).toBe(false);
    expect(demoOpen('2026-10-13T08:30:00Z', now)).toBe(true);
    expect(demoOpen('2026-10-13T07:30:00Z', now)).toBe(false);
    expect(demoOpen(null, now)).toBe(false);
  });
});
