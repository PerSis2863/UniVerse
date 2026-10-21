// Local test accounts the browser and API checks use (scripts/checks): Tara, a co-teacher, and Tom,
// a teaching assistant, on the sample course CS101. They exist only in the local database (signed
// in with the local demo sign-in, scripts/local/serve.mjs), never on the live site. Safe to run
// again: what's there already is left as it is.  Run from apps/web:  node scripts/local/test-accounts.mjs
import { run } from './run.mjs';

const now = new Date().toISOString().replace('Z', '+00:00');
const C = 'cmulde0g900147d341qn9mxlw'; // CS101 in the sample data
const sql = [
  `INSERT OR IGNORE INTO users (id, name, email, role, status, createdAt, updatedAt) VALUES ('local-tara', 'Tara Teacher', 'tara@teacher.com', 'TEACHER', 'ACTIVE', '${now}', '${now}'), ('local-tom', 'Tom Assistant', 'tom@teacher.com', 'TEACHER', 'ACTIVE', '${now}', '${now}')`,
  `INSERT OR IGNORE INTO course_staff (id, courseId, userId, role, createdAt) SELECT 'local-tara-cs101', '${C}', id, 'CO_TEACHER', '${now}' FROM users WHERE email = 'tara@teacher.com'`,
  `INSERT OR IGNORE INTO course_staff (id, courseId, userId, role, createdAt) SELECT 'local-tom-cs101', '${C}', id, 'TA', '${now}' FROM users WHERE email = 'tom@teacher.com'`,
].join('; ');
run('npx', ['wrangler', 'd1', 'execute', 'universe-db', '--local', '--command', sql]);
console.log('✔ Test teachers: tara@teacher.com (co-teacher) and tom@teacher.com (TA) on CS101, local only.');
