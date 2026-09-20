const fs = require('fs');
const path = require('path');
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));

const req = { user: { id: 'u1', role: 'student' } };
const reqT = { user: { id: 't1', role: 'teacher' } };
const reqA = { user: { id: 'a1', role: 'admin' } };

try {
  // student courses
  const courses = load('courses.json').courses.filter(c => c.students.includes(req.user.id));
  const assignments = load('grades.json').assignments;
  const c = courses.map(c => ({ ...c, assignments: assignments.filter(a => a.courseId === c.id) }));
  console.log('student courses OK, count: ' + c.length);
} catch(e) { console.error('student courses ERROR', e); }

try {
  // admin collab
  const c = load('collaboration.json');
  console.log('admin collab OK');
} catch(e) { console.error('admin collab ERROR', e); }

try {
  // teacher dashboard
  const courses = load('courses.json').courses.filter(c => c.professors.some(p => p.id === reqT.user.id));
  const allQuizzes = load('quizzes.json').quizzes;
  const courseIds = courses.map(c => c.id);
  const myQuizzes = allQuizzes.filter(q => courseIds.includes(q.courseId));
  console.log('teacher dashboard OK, courses count: ' + courses.length);
} catch(e) { console.error('teacher dashboard ERROR', e); }
