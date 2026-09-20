const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(express.static('public', { maxAge: '1d' }));

const PORT = 4000;
const JWT_SECRET = 'universe_jwt_secret_2026';

const load = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
const save = (file, data) => fs.writeFileSync(path.join(__dirname, 'data', file), JSON.stringify(data, null, 2));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── AUTH ──────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password, demoVerify } = req.body;
  const data = load('users.json');
  const userIndex = data.users.findIndex(u => u.email === email && u.password === password);
  
  if (userIndex === -1) return res.status(401).json({ error: 'Invalid credentials' });
  
  let user = data.users[userIndex];
  
  // Instant demo verification bypass
  if (demoVerify && user.status === 'pending_verification') {
    user.status = 'active';
    save('users.json', data);
  }

  if (user.status === 'pending_verification') {
    return res.status(403).json({ error: 'Your account is pending admin verification. Please wait for an admin to approve your account.' });
  }

  const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
  const { password: _, ...safeUser } = user;
  res.json({ success: true, token, user: safeUser });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;
  const data = load('users.json');
  
  if (data.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const newUser = {
    id: `U${Date.now()}`,
    name,
    email,
    password,
    role,
    status: role === 'student' ? 'pending_verification' : 'active',
    avatar: 'https://i.pravatar.cc/150?u=' + email
  };
  
  // Setup dummy data for student
  if (role === 'student') {
    newUser.studentId = `STU${Math.floor(Math.random() * 900000) + 100000}`;
    newUser.department = "Computer Science";
    newUser.year = 1;
    newUser.gpa = 0.0;
  }

  data.users.push(newUser);
  save('users.json', data);

  res.json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, status: newUser.status } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = load('users.json').users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password: _, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

// ─── FILE UPLOAD ───────────────────────────────────────────────
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = '/uploads/' + req.file.filename;
  res.json({ success: true, url: fileUrl, name: req.file.originalname });
});

// ─── NOTIFICATIONS ─────────────────────────────────────────────
app.get('/api/notifications', authMiddleware, (req, res) => {
  const data = load('notifications.json');
  const notifs = data.notifications.filter(n => n.userId === req.user.id);
  res.json({ notifications: notifs, unread: notifs.filter(n => !n.read).length });
});

app.post('/api/notifications/read', authMiddleware, (req, res) => {
  const { id } = req.body;
  const data = load('notifications.json');
  if (id === 'all') { data.notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; }); }
  else { const n = data.notifications.find(n => n.id === id && n.userId === req.user.id); if (n) n.read = true; }
  save('notifications.json', data);
  res.json({ success: true });
});

// ─── STUDENT ───────────────────────────────────────────────────
app.get('/api/student/quizzes', authMiddleware, (req, res) => {
  const quizzes = load('quizzes.json').quizzes;
  res.json({ quizzes: quizzes.filter(q => q.courseId && load('courses.json').courses.find(c => c.id === q.courseId)?.students.includes(req.user.id)) });
});

app.get('/api/student/impact', authMiddleware, (req, res) => {
  const data = load('social_impact.json');
  const myLogs = data.studentLogs.filter(l => l.studentId === req.user.id);
  const myHours = myLogs.filter(l => l.type === 'volunteer').reduce((s, l) => s + (l.hours || 0), 0);
  const myDonations = myLogs.filter(l => l.type === 'donation').reduce((s, l) => s + (l.amount || 0), 0);
  res.json({ 
    initiatives: data.initiatives, 
    myLogs, 
    myHours, 
    myDonations, 
    campusStats: data.campusStats 
  });
});

app.post('/api/student/impact/donate', authMiddleware, (req, res) => {
  const { initiativeId, amount } = req.body;
  const data = load('social_impact.json');
  data.studentLogs.push({ studentId: req.user.id, type: 'donation', initiativeId, amount: parseFloat(amount), date: new Date().toISOString().split('T')[0] });
  data.campusStats.totalDonations += parseFloat(amount);
  save('social_impact.json', data);
  res.json({ success: true });
});

app.get('/api/student/dashboard', authMiddleware, (req, res) => {
  const user = load('users.json').users.find(u => u.id === req.user.id);
  const courses = load('courses.json').courses.filter(c => c.students.includes(req.user.id));
  const attRecs = load('attendance.json').records.filter(r => r.studentId === req.user.id);
  const totalPresent = attRecs.filter(r => r.status === 'present').length;
  const attPct = attRecs.length > 0 ? Math.round((totalPresent / attRecs.length) * 100) : 0;
  const grades = load('grades.json').grades.filter(g => g.studentId === req.user.id);
  const upcoming = load('grades.json').assignments;
  const pendingPayments = load('payments.json').invoices.filter(i => i.studentId === req.user.id && i.status === 'pending');
  const notifs = load('notifications.json').notifications.filter(n => n.userId === req.user.id && !n.read);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = days[new Date().getDay()];
  const todayClasses = courses.flatMap(c => c.schedule.filter(s => s.day === today).map(s => ({ ...s, course: c.name, code: c.code, color: c.color, professors: c.professors })));
  res.json({
    user: { name: user.name, studentId: user.studentId, department: user.department, year: user.year, gpa: user.gpa, avatar: user.avatar },
    stats: { totalCourses: courses.length, attendancePct: attPct, gpa: user.gpa, pendingFees: pendingPayments.reduce((s,p)=>s+p.amount,0), unreadNotifs: notifs.length },
    upcomingDeadlines: upcoming.slice(0, 6),
    todayClasses: todayClasses.slice(0, 5),
    recentActivity: [
      { icon:'🏆', text:'Advanced Algorithms Assignment 2 graded: 92/100', time:'2h ago', type:'grade' },
      { icon:'📊', text:'Attendance marked for Linear Algebra (Present)', time:'5h ago', type:'attendance' },
      { icon:'📢', text:'Exam schedule released for Semester 6', time:'1d ago', type:'academic' },
      { icon:'💳', text:'Payment reminder: Tuition fee due Sep 30', time:'2d ago', type:'payment' }
    ]
  });
});

app.get('/api/student/attendance', authMiddleware, (req, res) => {
  const user = load('users.json').users.find(u => u.id === req.user.id);
  const courses = load('courses.json').courses.filter(c => c.students.includes(req.user.id));
  const attData = load('attendance.json');
  const allRecs = attData.records.filter(r => r.studentId === req.user.id);
  const justifications = attData.justifications?.filter(j => j.studentId === req.user.id) || [];
  const byCourse = courses.map(c => {
    const recs = allRecs.filter(r => r.courseId === c.id);
    const present = recs.filter(r => r.status === 'present').length;
    const pct = recs.length > 0 ? Math.round((present / recs.length) * 100) : 0;
    const justified = justifications.filter(j => j.courseId === c.id && j.status === 'approved').length;
    return { courseId: c.id, courseName: c.name, code: c.code, color: c.color, total: recs.length, present, absent: recs.length - present, justified, pct, records: recs.map(r => ({ ...r, justification: justifications.find(j => j.courseId === c.id && j.date === r.date) || null })), atRisk: pct < 75, professors: c.professors };
  });
  const totalPct = allRecs.length > 0 ? Math.round(allRecs.filter(r=>r.status==='present').length / allRecs.length * 100) : 0;
  res.json({ overall: totalPct, byCourse, allRecords: allRecs, justifications });
});

app.post('/api/student/attendance/justify', authMiddleware, (req, res) => {
  const { courseId, date, reason, description, photoUrl } = req.body;
  const attData = load('attendance.json');
  if (!attData.justifications) attData.justifications = [];
  const existing = attData.justifications.find(j => j.studentId === req.user.id && j.courseId === courseId && j.date === date);
  if (existing) return res.status(400).json({ error: 'Justification already submitted for this date' });
  const justif = { id: `j${Date.now()}`, studentId: req.user.id, courseId, date, reason, description, photoUrl: photoUrl || null, status: 'pending', submittedAt: new Date().toISOString() };
  attData.justifications.push(justif);
  save('attendance.json', attData);
  // Add a notification
  const notifData = load('notifications.json');
  notifData.notifications.unshift({ id: `n${Date.now()}`, userId: req.user.id, type: 'attendance', title: 'Absence Justification Submitted', message: `Your absence justification for ${date} has been submitted to the University Registrar and is pending review.`, read: false, timestamp: new Date().toISOString(), link: 'attendance' });
  save('notifications.json', notifData);
  res.json({ success: true, justification: justif });
});

app.get('/api/student/courses', authMiddleware, (req, res) => {
  const courses = load('courses.json').courses.filter(c => c.students.includes(req.user.id));
  const assignments = load('grades.json').assignments;
  res.json({ courses: courses.map(c => ({ ...c, assignments: assignments.filter(a => a.courseId === c.id) })) });
});

app.get('/api/student/grades', authMiddleware, (req, res) => {
  const gradesData = load('grades.json');
  const grades = gradesData.grades.filter(g => g.studentId === req.user.id);
  const courses = load('courses.json').courses;
  const enriched = grades.map(g => ({ ...g, courseName: courses.find(c=>c.id===g.courseId)?.name, courseCode: courses.find(c=>c.id===g.courseId)?.code, color: courses.find(c=>c.id===g.courseId)?.color }));
  const gpa = grades.length ? (grades.reduce((s,g)=>s+g.gradePoint,0)/grades.length).toFixed(2) : 0;
  res.json({ grades: enriched, gpa, semesterHistory: gradesData.semesterHistory, assignments: gradesData.assignments });
});

app.get('/api/student/payments', authMiddleware, (req, res) => {
  const payments = load('payments.json');
  const invoices = payments.invoices.filter(i => i.studentId === req.user.id);
  const transactions = payments.transactions.filter(t => t.studentId === req.user.id);
  const totalPending = invoices.filter(i=>i.status==='pending').reduce((s,i)=>s+i.amount,0);
  const totalPaid = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+i.amount,0);
  res.json({ invoices, transactions, summary: { totalPending, totalPaid } });
});

app.post('/api/student/payments/pay', authMiddleware, (req, res) => {
  const { invoiceId } = req.body;
  const paymentsData = load('payments.json');
  const invoice = paymentsData.invoices.find(i => i.id === invoiceId && i.studentId === req.user.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'Already paid' });
  const receiptId = `RCP${Date.now()}`;
  invoice.status = 'paid'; invoice.paidDate = new Date().toISOString().split('T')[0]; invoice.receiptId = receiptId;
  const txn = { id: `txn${Date.now()}`, invoiceId, studentId: req.user.id, amount: invoice.amount, date: new Date().toISOString().split('T')[0], method: req.body.method || 'card', last4: req.body.last4 || '****', brand: req.body.brand || 'Visa', receiptId, status: 'success' };
  paymentsData.transactions.push(txn);
  save('payments.json', paymentsData);
  const notifData = load('notifications.json');
  notifData.notifications.unshift({ id: `n${Date.now()}`, userId: req.user.id, type: 'payment', title: 'Payment Successful', message: `Payment of €${invoice.amount.toLocaleString()} for "${invoice.title}" was successful. Receipt: ${receiptId}`, read: false, timestamp: new Date().toISOString(), link: 'payments' });
  save('notifications.json', notifData);
  res.json({ success: true, receiptId, transaction: txn, invoice });
});

// ─── AUDENCIA FEATURES ──────────────────────────────────────────
app.get('/api/student/knowledge', authMiddleware, (req, res) => {
  res.json({ materials: [
    { id: 'k1', title: 'Machine Learning Basics', type: 'PDF', course: 'Computer Science', size: '2.4 MB', date: '2025-01-15' },
    { id: 'k2', title: 'Data Structures Cheat Sheet', type: 'DOCX', course: 'Algorithms', size: '1.1 MB', date: '2025-02-10' },
    { id: 'k3', title: 'Cloud Architecture Patterns', type: 'VIDEO', course: 'Cloud Computing', size: '145 MB', date: '2025-03-01' },
    { id: 'k4', title: 'Audencia Management Principles', type: 'PDF', course: 'Business', size: '4.5 MB', date: '2025-03-10' },
    { id: 'k5', title: 'Calculus III Lectures', type: 'VIDEO', course: 'Mathematics', size: '320 MB', date: '2025-01-22' },
    { id: 'k6', title: 'Ethics in AI', type: 'PDF', course: 'Philosophy', size: '3.1 MB', date: '2025-02-05' },
    { id: 'k7', title: 'System Design Interview Prep', type: 'DOCX', course: 'Computer Science', size: '5.2 MB', date: '2025-03-15' },
    { id: 'k8', title: 'Financial Accounting 101', type: 'PDF', course: 'Business', size: '8.4 MB', date: '2025-02-28' },
    { id: 'k9', title: 'Quantum Computing Intro', type: 'VIDEO', course: 'Physics', size: '210 MB', date: '2025-01-10' },
    { id: 'k10', title: 'Marketing Strategy Case Studies', type: 'PDF', course: 'Marketing', size: '12 MB', date: '2025-03-18' }
  ]});
});

app.get('/api/student/career', authMiddleware, (req, res) => {
  res.json({ jobs: [
    { id: 'j1', title: 'Software Engineering Intern', company: 'Google', location: 'Paris, France', type: 'Internship', posted: '2 days ago' },
    { id: 'j2', title: 'Data Analyst Apprentice', company: 'LVMH', location: 'Remote', type: 'Apprenticeship', posted: '5 days ago' },
    { id: 'j3', title: 'Product Manager Intern', company: 'Microsoft', location: 'London, UK', type: 'Internship', posted: '1 week ago' },
    { id: 'j4', title: 'Financial Analyst Intern', company: 'Goldman Sachs', location: 'Frankfurt, Germany', type: 'Internship', posted: '3 days ago' },
    { id: 'j5', title: 'Junior AI Researcher', company: 'DeepMind', location: 'London, UK', type: 'Full-time', posted: '2 weeks ago' },
    { id: 'j6', title: 'Marketing Assistant', company: 'L\'Oréal', location: 'Paris, France', type: 'Part-time', posted: '1 day ago' },
    { id: 'j7', title: 'DevOps Engineer', company: 'Stripe', location: 'Dublin, Ireland', type: 'Full-time', posted: '4 days ago' }
  ]});
});

app.get('/api/student/alumni', authMiddleware, (req, res) => {
  res.json({ alumni: [
    { id: 'a1', name: 'Sophie Martin', gradYear: 2021, company: 'Amazon', role: 'Senior Developer', location: 'Berlin, Germany' },
    { id: 'a2', name: 'Lucas Bernard', gradYear: 2019, company: 'McKinsey', role: 'Consultant', location: 'Paris, France' },
    { id: 'a3', name: 'Emma Dubois', gradYear: 2023, company: 'Startup Inc.', role: 'Founder & CEO', location: 'Nantes, France' },
    { id: 'a4', name: 'James Wilson', gradYear: 2018, company: 'Google', role: 'Engineering Manager', location: 'London, UK' },
    { id: 'a5', name: 'Aisha Patel', gradYear: 2022, company: 'Tesla', role: 'Data Scientist', location: 'Amsterdam, NL' },
    { id: 'a6', name: 'Marco Rossi', gradYear: 2020, company: 'Spotify', role: 'Product Manager', location: 'Stockholm, Sweden' }
  ]});
});

app.get('/api/student/documents', authMiddleware, (req, res) => {
  const user = load('users.json').users.find(u => u.id === req.user.id);
  res.json({ 
    cvec: user.cvec || '',
    docs: [
      { id: 'd1', title: 'Enrollment Certificate 2025', date: '2025-09-01' },
      { id: 'd2', title: 'Academic Transcript Y1', date: '2024-06-30' },
      { id: 'd3', title: 'Student ID Card (Digital)', date: '2025-09-05' }
    ]
  });
});

app.post('/api/student/documents/cvec', authMiddleware, (req, res) => {
  const usersData = load('users.json');
  const user = usersData.users.find(u => u.id === req.user.id);
  if (user) {
    user.cvec = req.body.cvec;
    save('users.json', usersData);
  }
  res.json({ success: true });
});

app.get('/api/student/inbox', authMiddleware, (req, res) => {
  res.json({
    messages: [
      { id: 'm1', sender: 'Prof. Alan Turing', subject: 'Regarding your recent assignment', date: '10:30 AM', body: 'Great work on the ML assignment! I have a few notes for improvement.' },
      { id: 'm2', sender: 'University Registrar', subject: 'CVEC Update Required', date: 'Yesterday', body: 'Please ensure your CVEC number is updated in the Official Documents section.' }
    ],
    reports: [
      { id: 'r1', subject: 'Broken projector in Room 402', status: 'Resolved', date: 'Oct 12' },
      { id: 'r2', subject: 'Library access card issue', status: 'Pending', date: 'Nov 5' }
    ]
  });
});

app.post('/api/student/inbox', authMiddleware, (req, res) => {
  // Mock sending message/report
  res.json({ success: true });
});

// ─── COLLABORATION ─────────────────────────────────────────────
app.get('/api/collaboration', authMiddleware, (req, res) => {
  const data = load('collaboration.json');
  res.json({ projects: data.projects });
});

app.post('/api/collaboration/join', authMiddleware, (req, res) => {
  const { projectId } = req.body;
  const data = load('collaboration.json');
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.userJoined) { project.userJoined = false; project.members--; }
  else { project.userJoined = true; project.members++; }
  save('collaboration.json', data);
  res.json({ success: true, joined: project.userJoined, members: project.members });
});

// ─── ORGANIZATIONS ─────────────────────────────────────────────
app.get('/api/organizations', authMiddleware, (req, res) => {
  res.json({ organizations: load('organizations.json').organizations });
});

// ─── MATERIALS & QUIZZES ───────────────────────────────────────
app.get('/api/student/materials', authMiddleware, (req, res) => {
  const materials = load('materials.json');
  res.json({ materials: materials });
});

app.post('/api/student/materials/view', authMiddleware, (req, res) => {
  const { materialId } = req.body;
  const materials = load('materials.json');
  const material = materials.find(m => m.id === materialId);
  if (material) {
    if (!material.views) material.views = [];
    if (!material.views.some(v => v.studentId === req.user.id)) {
      material.views.push({ studentId: req.user.id, viewedAt: new Date().toISOString() });
      save('materials.json', materials);
    }
  }
  res.json({ success: true });
});

app.get('/api/teacher/quizzes', authMiddleware, (req, res) => {
  const courses = load('courses.json').courses.map(c => c.id);
  const quizzes = load('quizzes.json').quizzes.filter(q => courses.includes(q.courseId));
  res.json({ quizzes });
});

app.post('/api/teacher/quizzes', authMiddleware, (req, res) => {
  const { courseId, title, dueDate, questions } = req.body;
  const course = load('courses.json').courses.find(c => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const qData = load('quizzes.json');
  const newQuiz = { id: `q_${Date.now()}`, courseId, title, dueDate, questions, submissions: [] };
  if(!qData.quizzes) qData.quizzes = [];
  qData.quizzes.push(newQuiz);
  save('quizzes.json', qData);
  res.json({ success: true, quiz: newQuiz });
});


app.post('/api/student/quizzes/submit', authMiddleware, (req, res) => {
  const { quizId, score, maxScore } = req.body;
  const quizzes = load('quizzes.json');
  const quiz = quizzes.find(q => q.id === quizId);
  if (quiz) {
    if (!quiz.attempts) quiz.attempts = [];
    quiz.attempts.push({ studentId: req.user.id, score, maxScore, completedAt: new Date().toISOString() });
    save('quizzes.json', quizzes);
  }
  res.json({ success: true, score });
});

// ─── TEACHER ───────────────────────────────────────────────────
app.get('/api/teacher/dashboard', authMiddleware, (req, res) => {
  const user = load('users.json').users.find(u => u.id === req.user.id);
  const allCourses = load('courses.json').courses;
  const courses = allCourses.filter(c => c.professors?.some(p => p.id === req.user.id));
  const totalStudents = [...new Set(courses.flatMap(c => c.students))].length;
  const allAttRecs = load('attendance.json').records;
  const courseAtt = courses.map(c => { const recs = allAttRecs.filter(r => r.courseId === c.id); const pct = recs.length ? Math.round(recs.filter(r=>r.status==='present').length/recs.length*100) : 0; return { courseId: c.id, name: c.name, avgAttendance: pct }; });
  res.json({ user: { name: user.name, teacherId: user.teacherId, department: user.department, designation: user.designation }, stats: { totalCourses: courses.length, totalStudents, avgAttendance: courseAtt.length ? Math.round(courseAtt.reduce((s,c)=>s+c.avgAttendance,0)/courseAtt.length) : 0 }, courses: courses.map(c => ({ ...c, studentCount: c.students.length })), courseAttendance: courseAtt });
});

app.get('/api/teacher/students/:courseId', authMiddleware, (req, res) => {
  const course = load('courses.json').courses.find(c => c.id === req.params.courseId && c.professors?.some(p => p.id === req.user.id));
  if (!course) return res.status(403).json({ error: 'Not your course' });
  const students = load('users.json').users.filter(u => course.students.includes(u.id)).map(({ password: _, ...s }) => s);
  const attRecs = load('attendance.json').records.filter(r => r.courseId === req.params.courseId);
  const enriched = students.map(s => { const recs = attRecs.filter(r => r.studentId === s.id); const pct = recs.length ? Math.round(recs.filter(r=>r.status==='present').length/recs.length*100) : 0; return { ...s, attendancePct: pct, totalClasses: recs.length }; });
  res.json({ course, students: enriched });
});

app.post('/api/teacher/attendance', authMiddleware, (req, res) => {
  const { courseId, date, records } = req.body;
  const course = load('courses.json').courses.find(c => c.id === courseId && c.professors?.some(p => p.id === req.user.id));
  if (!course) return res.status(403).json({ error: 'Not your course' });
  const attData = load('attendance.json');
  attData.records = attData.records.filter(r => !(r.courseId === courseId && r.date === date));
  records.forEach(r => { attData.records.push({ id: `a${Date.now()}_${r.studentId}`, courseId, studentId: r.studentId, date, status: r.status }); });
  save('attendance.json', attData);
  res.json({ success: true, saved: records.length });
});

app.post('/api/teacher/grades', authMiddleware, (req, res) => {
  const { studentId, courseId, assignmentName, score, maxScore } = req.body;
  const course = load('courses.json').courses.find(c => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const gradesData = load('grades.json');
  let gr = gradesData.grades.find(g => g.studentId === studentId && g.courseId === courseId);
  if (!gr) { gr = { id: `g${Date.now()}`, studentId, courseId, assignments: [], finalExam: null, grade: '-', gradePoint: 0 }; gradesData.grades.push(gr); }
  gr.assignments.push({ name: assignmentName, score, max: maxScore });
  save('grades.json', gradesData);
  res.json({ success: true, grade: gr });
});

app.post('/api/teacher/knowledge', authMiddleware, (req, res) => {
  const { title, type, size, link } = req.body;
  const matData = load('materials.json');
  const newMat = {
    id: 'm' + Date.now(),
    title,
    type,
    size,
    date: new Date().toISOString(),
    link
  };
  matData.materials.unshift(newMat);
  save('materials.json', matData);
  res.json({ success: true, material: newMat });
});
app.put('/api/teacher/knowledge/:id', authMiddleware, (req, res) => {
  const { title, type } = req.body;
  const matData = load('materials.json');
  const mat = matData.materials.find(m => m.id === req.params.id);
  if (!mat) return res.status(404).json({ error: 'Material not found' });
  if (title) mat.title = title;
  if (type) mat.type = type;
  save('materials.json', matData);
  res.json({ success: true, material: mat });
});

app.put('/api/teacher/quizzes/:id', authMiddleware, (req, res) => {
  const { title, dueDate, questions } = req.body;
  const qData = load('quizzes.json');
  const quiz = qData.quizzes.find(q => q.id === req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  if (title) quiz.title = title;
  if (dueDate) quiz.dueDate = dueDate;
  if (questions) quiz.questions = questions;
  save('quizzes.json', qData);
  res.json({ success: true, quiz });
});

// ─── ANNOUNCEMENTS ─────────────────────────────────────────────
app.get('/api/announcements', authMiddleware, (req, res) => {
  const data = load('announcements.json');
  res.json({ announcements: data.announcements || [] });
});

app.post('/api/announcements', authMiddleware, (req, res) => {
  const { title, msg, target } = req.body;
  const data = load('announcements.json');
  if(!data.announcements) data.announcements = [];
  const newAnn = {
    id: `ann_${Date.now()}`,
    title,
    msg,
    target, // e.g., 'All Students', 'CS101'
    sender: req.user.name,
    senderRole: req.user.role,
    date: new Date().toISOString()
  };
  data.announcements.unshift(newAnn);
  save('announcements.json', data);
  res.json({ success: true, announcement: newAnn });
});

app.put('/api/announcements/:id', authMiddleware, (req, res) => {
  if(req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  const { title, msg, target } = req.body;
  const data = load('announcements.json');
  const ann = data.announcements.find(a => a.id === req.params.id);
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });
  if (title) ann.title = title;
  if (msg) ann.msg = msg;
  if (target) ann.target = target;
  save('announcements.json', data);
  res.json({ success: true, announcement: ann });
});

app.delete('/api/announcements/:id', authMiddleware, (req, res) => {
  if(req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  const data = load('announcements.json');
  data.announcements = data.announcements.filter(a => a.id !== req.params.id);
  save('announcements.json', data);
  res.json({ success: true });
});

// ─── ADMIN ─────────────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const users = load('users.json').users;
  const students = users.filter(u=>u.role==='student'); const teachers = users.filter(u=>u.role==='teacher');
  const allAtt = load('attendance.json').records;
  const overallAtt = allAtt.length ? Math.round(allAtt.filter(r=>r.status==='present').length/allAtt.length*100) : 0;
  const payments = load('payments.json');
  const totalRevenue = payments.transactions.reduce((s,t)=>s+t.amount,0);
  const pendingFees = payments.invoices.filter(i=>i.status==='pending').reduce((s,i)=>s+i.amount,0);
  res.json({ stats: { totalStudents: students.length, totalTeachers: teachers.length, totalCourses: load('courses.json').courses.length, overallAttendance: overallAtt, totalRevenue, pendingFees, totalOrgs: load('organizations.json').organizations.length }, recentUsers: users.slice(-5).map(({ password: _, ...u }) => u), users: users.map(({ password: _, ...u }) => u) });
});
app.get('/api/admin/verifications', authMiddleware, (req, res) => {
  const users = load('users.json').users.filter(u => u.status === 'pending_verification');
  res.json({ users: users.map(({ password: _, ...u }) => u) });
});

app.post('/api/admin/verifications/review', authMiddleware, (req, res) => {
  const { userId, action } = req.body;
  const data = load('users.json');
  const user = data.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  if (action === 'approve') {
    user.status = 'active';
  } else {
    data.users = data.users.filter(u => u.id !== userId);
  }
  
  save('users.json', data);
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, (req, res) => { res.json({ users: load('users.json').users.map(({ password: _, ...u }) => u) }); });
app.post('/api/admin/users', authMiddleware, (req, res) => { const d=load('users.json'); const u={id:`u${Date.now()}`,...req.body}; d.users.push(u); save('users.json',d); const{password:_,...s}=u; res.json({success:true,user:s}); });
app.delete('/api/admin/users/:id', authMiddleware, (req, res) => { const d=load('users.json'); d.users=d.users.filter(u=>u.id!==req.params.id); save('users.json',d); res.json({success:true}); });
app.get('/api/admin/attendance', authMiddleware, (req, res) => { const r=load('attendance.json').records; const u=load('users.json').users; const c=load('courses.json').courses; res.json({ records: r.map(rec=>({...rec,studentName:u.find(x=>x.id===rec.studentId)?.name,courseName:c.find(x=>x.id===rec.courseId)?.name})), total:r.length, present:r.filter(x=>x.status==='present').length, absent:r.filter(x=>x.status==='absent').length }); });

app.get('/api/admin/justifications', authMiddleware, (req, res) => {
  const attData = load('attendance.json');
  const u = load('users.json').users;
  const c = load('courses.json').courses;
  const justifs = (attData.justifications || []).map(j => ({
    ...j,
    studentName: u.find(x => x.id === j.studentId)?.name,
    studentIdNum: u.find(x => x.id === j.studentId)?.studentId,
    courseName: c.find(x => x.id === j.courseId)?.name
  })).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ justifications: justifs });
});

app.post('/api/admin/justifications/review', authMiddleware, (req, res) => {
  const { id, status } = req.body;
  const attData = load('attendance.json');
  const j = attData.justifications?.find(x => x.id === id);
  if (!j) return res.status(404).json({ error: 'Justification not found' });
  j.status = status;
  save('attendance.json', attData);
  
  const notifs = load('notifications.json');
  notifs.notifications.unshift({ id: `n${Date.now()}`, userId: j.studentId, type: 'attendance', title: 'Absence Justification Reviewed', message: `Your absence for ${j.date} has been ${status} by the Registrar.`, read: false, timestamp: new Date().toISOString(), link: 'attendance' });
  save('notifications.json', notifs);
  res.json({ success: true, justification: j });
});

app.get('/api/teacher/timetable', authMiddleware, (req, res) => {
  const courses = load('courses.json').courses.filter(c => c.professors.includes(req.user.name));
  res.json({ courses });
});
app.get('/api/admin/finance', authMiddleware, (req, res) => { const p=load('payments.json'); const u=load('users.json').users; res.json({ invoices:p.invoices.map(i=>({...i,studentName:u.find(x=>x.id===i.studentId)?.name})), transactions:p.transactions, summary:{total:p.invoices.reduce((s,i)=>s+i.amount,0),collected:p.transactions.reduce((s,t)=>s+t.amount,0),pending:p.invoices.filter(i=>i.status==='pending').reduce((s,i)=>s+i.amount,0)} }); });

app.get('/api/admin/wifi', authMiddleware, (req, res) => {
  const wifiData = load('wifi_logs.json');
  const u = load('users.json').users;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const start = (page - 1) * limit;
  const logs = wifiData.logs.slice(start, start + limit).map(l => ({...l, studentName: u.find(x => x.id === l.studentId)?.name}));
  res.json({ logs, total: wifiData.logs.length, page, limit });
});

app.get('/api/admin/materials-tracking', authMiddleware, (req, res) => {
  const materialsData = load('materials.json');
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const start = (page - 1) * limit;
  const materials = materialsData.materials.slice(start, start + limit);
  res.json({ materials, total: materialsData.materials.length, page, limit });
});

app.get('/api/admin/courses', authMiddleware, (req, res) => {
  res.json({ courses: load('courses.json').courses });
});

app.get('/api/admin/impact', authMiddleware, (req, res) => {
  const data = load('social_impact.json');
  res.json(data);
});

app.get('/api/admin/collaboration-monitor', authMiddleware, (req, res) => {
  const collabData = load('collaboration.json');
  res.json({ projects: collabData.projects });
});
// ─── CHATBOT ───────────────────────────────────────────────────
app.post('/api/chatbot', authMiddleware, async (req, res) => {
  const { message, history, context } = req.body;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    const demos = { 'attend':()=>`Your overall attendance is ${context?.attendance||'80'}%. ${context?.attendance<75?'⚠️ You are at risk — below 75% minimum!':'✅ You are on track.'}`, 'grade':()=>`Your current GPA is ${context?.gpa||'8.6'}/10. Strongest: Linear Algebra (A+). Check the Grades section for full details.`, 'pay':()=>`You have €${context?.pendingFees||'6,350'} in pending fees. Next due: September 30 (Tuition). Pay securely in the Payments section.`, 'assign':()=>`You have ${context?.assignments||7} upcoming assignments. Nearest deadline: "Implement Dijkstra's Algorithm" due Sep 25.`, 'collab':()=>`You are part of 3 collaboration projects. The most active is "Open Source EdTech Platform" with 47 members.`, 'course':()=>`You are enrolled in 8 courses this semester, from Advanced Algorithms to Ethics in Technology.`, 'help':()=>`I can help with:\n• 📊 Attendance & justifications\n• 🏆 Grades & GPA\n• 💳 Payment & fees\n• 📚 Courses & assignments\n• 🤝 Collaboration projects\n• 🌱 Social impact & NGOs` };
    const lower = message.toLowerCase();
    let reply = `I'm UniBot! I can help with attendance, grades, payments, courses, and more. What would you like to know? 😊`;
    for (const [k,fn] of Object.entries(demos)) { if (lower.includes(k.substring(0,5))) { reply = fn(); break; } }
    return res.json({ reply, mode: 'demo' });
  }
  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const systemPrompt = `You are UniBot, an intelligent AI assistant for the UniVerse university management platform. You are helping ${req.user.name} who is a ${req.user.role}. ${context ? `Context: ${JSON.stringify(context)}` : ''} Be concise, helpful, and friendly. Use emojis occasionally.`;
    const contents = [...(history?.map(h => ({ role: h.role, parts: [{ text: h.content }] })) || []), { role: 'user', parts: [{ text: message }] }];
    const response = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents, config: { systemInstruction: systemPrompt, maxOutputTokens: 500 } });
    res.json({ reply: response.text, mode: 'gemini' });
  } catch (err) { res.status(500).json({ error: 'Chatbot error', details: err.message }); }
});

['student','teacher','admin'].forEach(role => { app.get(`/${role}`, (req, res) => res.sendFile(path.join(__dirname, 'public', `${role}.html`))); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🎓  UniVerse University Platform\n🚀  Running at http://localhost:${PORT}\n\n📧  Demo Credentials:\n    Student:  student@universe.edu / student123\n    Teacher:  teacher@universe.edu / teacher123\n    Admin:    admin@universe.edu   / admin123\n\n🤖  Gemini AI: ${process.env.GEMINI_API_KEY ? '✅ Connected' : '⚠️  Demo mode (set GEMINI_API_KEY)'}\n`);
});
