import { describe, expect, it } from 'vitest';
import { bestModule, byMatch, explain, matchSkills, sameSkill, type GapModule, type Verified } from './skills-bridge';

const v = (label: string, level: Verified['level'] = 'Proficient', count = 1): Verified => ({ key: label.toLowerCase(), label, level, count });

describe('skills-to-jobs bridge (D18)', () => {
  it('treats a more specific name as the same skill, whole words only', () => {
    expect(sameSkill('SQL', 'SQL basics')).toBe(true);
    expect(sameSkill('Data analysis with Python', 'data analysis')).toBe(true);
    expect(sameSkill('Public speaking', 'public  Speaking')).toBe(true);
    expect(sameSkill('Java', 'JavaScript')).toBe(false);
    expect(sameSkill('R', 'React')).toBe(false);
    expect(sameSkill('C++', 'C#')).toBe(false);
    expect(sameSkill('Node.js', 'node.js')).toBe(true);
    expect(sameSkill('', 'SQL')).toBe(false);
  });

  it('counts what the passport shows, strongest evidence first', () => {
    const m = matchSkills(['SQL', 'Python', 'Teamwork', 'sql', 'Figma'], [v('SQL basics', 'Developing'), v('SQL', 'Advanced', 2), v('Python programming'), v('Teamwork', null)]);
    expect(m.matched).toEqual([
      { skill: 'SQL', level: 'Advanced', evidence: 3 },
      { skill: 'Python', level: 'Proficient', evidence: 1 },
      { skill: 'Teamwork', level: null, evidence: 1 },
    ]);
    expect(m.missing).toEqual(['Figma']);
    expect(m.percent).toBe(75); // "sql" twice is one skill: 3 of 4
  });

  it('points the gap at a class you are in first', () => {
    const other: GapModule = { courseId: 'c2', courseCode: 'DS200', courseName: 'Data', moduleTitle: 'SQL basics', enrolled: false };
    const mine: GapModule = { courseId: 'c1', courseCode: 'CS201', courseName: 'Databases', moduleTitle: null, enrolled: true };
    expect(bestModule([other, mine])).toBe(mine);
    expect(bestModule([])).toBeNull();
  });

  it('explains the match in plain words', () => {
    const one = matchSkills(['SQL', 'Python', 'Git', 'Teamwork', 'Excel'], [v('SQL'), v('Python'), v('Git'), v('Teamwork')]);
    expect(explain(one, { skill: 'Excel', module: { courseId: 'c', courseCode: 'CS201', courseName: 'x', moduleTitle: 'Spreadsheets', enrolled: true }, tutor: null }))
      .toBe('You match 4 of 5 skills; finish ‘Spreadsheets’ in CS201 to match all.');
    expect(explain(one, { skill: 'Excel', module: { courseId: 'c', courseCode: 'DS200', courseName: 'x', moduleTitle: null, enrolled: false }, tutor: null }))
      .toBe('You match 4 of 5 skills; take DS200 to match all.');
    expect(explain(one, { skill: 'Excel', module: null, tutor: { userId: 'u', name: 'Asha Rao' } })).toBe('You match 4 of 5 skills; learn Excel with Asha, a peer tutor, to match all.');
    expect(explain(matchSkills(['SQL', 'Git'], [v('SQL'), v('git')]))).toBe('You match all 2 skills it asks for.');
    expect(explain(matchSkills(['SQL', 'Git', 'Go'], [v('SQL')]))).toBe('You match 1 of 3 skills; 2 to learn.');
    expect(explain(matchSkills([], []))).toBe('No skills listed for this one.');
  });

  it('sorts the best matches first, then the soonest deadline', () => {
    const it_ = (id: string, asked: string[], have: Verified[], deadline: string | null) => ({ id, deadline, match: matchSkills(asked, have) });
    const list = byMatch([
      it_('half', ['SQL', 'Go'], [v('SQL')], '2026-11-01'),
      it_('all-late', ['SQL'], [v('SQL')], '2026-12-01'),
      it_('all-soon', ['SQL'], [v('SQL')], '2026-10-20'),
      it_('none', ['Go'], [], null),
    ]);
    expect(list.map((x) => x.id)).toEqual(['all-soon', 'all-late', 'half', 'none']);
  });
});
