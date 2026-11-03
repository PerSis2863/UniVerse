import { selectColumns } from './table-stats';

// M79: the owner console's "Real people" card. Everyone except made-up accounts: the console's
// sample world (emails @sample.universe.test, ids smp…), the demo sign-in accounts and the two
// sample students from the first database update. One query (a few columns each), no names.

const MADE_UP = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com', 'alice@student.com', 'bob@student.com'];
/** SQL: the account `u` is a real person. Only fixed text, nothing from a request. */
export const REAL = (u: string) => `${u}.email NOT LIKE '%@sample.universe.test' AND ${u}.id NOT LIKE 'smp%' AND lower(${u}.email) NOT IN (${MADE_UP.map((e) => `'${e}'`).join(', ')})`;

export const APPS = [
  ['UniVersity', null],
  ['Trace', 'trace_scans'],
  ['Relief', 'relief_posts'],
  ['Green', 'green_actions'],
  ['Play', 'game_scores'],
] as const;

const DAY = 86_400_000;
// Stored dates end in "+00:00" (the D1 adapter), so compare against the same form.
const at = (ms: number) => `'${new Date(ms).toISOString().replace('Z', '+00:00')}'`;

/** The columns: totals, active in 1/7/30 days, new, back again, and per app the people who did
 *  something there in 7 and 30 days (UniVersity: active people in a course, as student or teacher). */
export function realPeopleColumns(now: number): [string, string][] {
  const d1 = at(now - DAY), d7 = at(now - 7 * DAY), d30 = at(now - 30 * DAY);
  const users = (where: string) => `(SELECT COUNT(*) FROM users u WHERE ${REAL('u')} AND ${where})`;
  const cols: [string, string][] = [
    ['people', users('1')],
    ['left', `(SELECT COUNT(*) FROM users u WHERE NOT (${REAL('u')}))`],
    ['day', users(`u.lastSeenAt > ${d1}`)],
    ['week', users(`u.lastSeenAt > ${d7}`)],
    ['month', users(`u.lastSeenAt > ${d30}`)],
    ['new7', users(`u.createdAt > ${d7}`)],
    ['new30', users(`u.createdAt > ${d30}`)],
    // Joined over a week ago and used it this week: people who came back.
    ['back7', users(`u.createdAt <= ${d7} AND u.lastSeenAt > ${d7}`)],
    ['never', users(`u.lastSeenAt IS NULL`)],
  ];
  for (const [name, table] of APPS) {
    for (const [k, since] of [['7', d7], ['30', d30]] as const) {
      cols.push([`${name}${k}`, table
        ? `(SELECT COUNT(DISTINCT t.userId) FROM ${table} t JOIN users u ON u.id = t.userId WHERE ${REAL('u')} AND t.createdAt > ${since})`
        : users(`u.lastSeenAt > ${since} AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.studentId = u.id) OR EXISTS (SELECT 1 FROM courses c WHERE c.teacherId = u.id))`)]);
    }
  }
  return cols;
}

export async function realPeople(now = Date.now()) {
  const got = await selectColumns(realPeopleColumns(now));
  const n = (k: string) => Number(got[k] ?? 0);
  return {
    people: n('people'), left: n('left'), activeDay: n('day'), activeWeek: n('week'), activeMonth: n('month'),
    new7: n('new7'), new30: n('new30'), back7: n('back7'), never: n('never'),
    apps: APPS.map(([name]) => ({ name, week: n(`${name}7`), month: n(`${name}30`) })),
  };
}
