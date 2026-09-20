const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function save(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem(arr) {
  return arr[rand(0, arr.length - 1)];
}

// 1. Generate Organizations (30+)
const orgTypes = ['ngo', 'business', 'it', 'university'];
const orgNames = ['Global Tech', 'Green Earth', 'AI Ethics Board', 'Future Innovators', 'Quantum Corp', 'EduCare', 'HealthPlus', 'Smart City Initiative', 'Data4Good', 'CyberDefenders', 'OpenSource Alliance', 'Women in Tech', 'Startup Incubator', 'Cloud Native Foundation', 'FinTech Solutions', 'AgriTech Network', 'Space Exploration Org', 'BioTech Innovations', 'Clean Energy Coalition', 'Robotics Society', 'VR/AR Pioneers', 'Blockchain Consortium', 'EdTech Ventures', 'MedTech Solutions', 'GovTech Initiative', 'Creative Arts Network', 'Social Impact Hub', 'Sustainable Future', 'Urban Mobility Org', 'Digital Inclusion'];
const orgs = [];
for (let i = 0; i < orgNames.length; i++) {
  orgs.push({
    id: `org${i+1}`,
    name: orgNames[i],
    type: randItem(orgTypes),
    description: `This is a comprehensive description for ${orgNames[i]}. They focus on advancing their field through research, collaboration, and community engagement. Their projects span multiple continents and involve thousands of volunteers and professionals.`,
    members: rand(100, 10000),
    volunteerHours: rand(500, 50000),
    location: randItem(['Paris', 'London', 'New York', 'Berlin', 'Tokyo', 'San Francisco', 'Remote', 'Global']),
    tags: [randItem(['AI', 'Sustainability', 'Education', 'Health', 'Finance']), randItem(['Research', 'Development', 'Community', 'Advocacy'])],
    contact: `contact@${orgNames[i].replace(/\s/g, '').toLowerCase()}.org`,
    featured: Math.random() > 0.8
  });
}
save('organizations.json', { organizations: orgs });

// 2. Generate Collaborations (25+)
const collabNames = ['Smart Campus Initiative', 'AI for Climate Change', 'NextGen E-Learning', 'Urban Traffic Optimization', 'Blockchain Voting System', 'Telemedicine Platform', 'Precision Agriculture', 'Renewable Energy Grid', 'Robotic Waste Management', 'VR Medical Training', 'Cybersecurity Threat Intelligence', 'Quantum Cryptography', 'Natural Disaster Prediction', 'Personalized Learning Paths', 'Elderly Care Robotics', 'Smart Water Management', 'Air Quality Monitoring', 'Autonomous Delivery Drones', 'FinTech Microloans', 'AgriTech Supply Chain', 'EdTech Gamification', 'MedTech Wearables', 'GovTech E-Services', 'Creative Arts VR Gallery', 'Social Impact Micro-volunteering'];
const collabs = [];
for (let i = 0; i < collabNames.length; i++) {
  collabs.push({
    id: `collab${i+1}`,
    name: collabNames[i],
    category: randItem(['IT', 'NGO', 'Business', 'University']),
    status: randItem(['active', 'recruiting', 'completed']),
    description: `A collaborative project focusing on ${collabNames[i]}. This initiative brings together experts from various fields to tackle complex challenges and create innovative solutions.`,
    leadPerson: { name: `Dr. ${randItem(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'])}`, org: randItem(orgNames), avatar: '👤' },
    members: rand(10, 100),
    discussions: rand(5, 50),
    tags: [randItem(['Innovation', 'Research', 'Development']), randItem(['Tech', 'Society', 'Environment'])],
    goals: ['Phase 1: Research', 'Phase 2: Prototype', 'Phase 3: Deployment'],
    timeline: { start: 'Jan 2026', end: 'Dec 2026', phase: randItem(['Planning', 'Execution', 'Review']) },
    tasks: [{ title: 'Initial Planning', assignee: 'Team A', status: 'done' }, { title: 'Development', assignee: 'Team B', status: 'in-progress' }, { title: 'Testing', assignee: 'Team C', status: 'pending' }],
    universities: ['UniVerse', 'Tech Institute', 'Global University'],
    orgs: [randItem(orgNames), randItem(orgNames)],
    files: ['Project_Proposal.pdf', 'Architecture_Diagram.png', 'Meeting_Notes.md']
  });
}
save('collaboration.json', { projects: collabs, stats: { totalProjects: collabs.length, joined: rand(5,15), active: collabs.filter(c=>c.status==='active').length, members: collabs.reduce((s,c)=>s+c.members,0) } });

// 3. Generate Users (20+ students, 10+ teachers)
const users = [];
const students = [];
for (let i = 1; i <= 25; i++) {
  const u = {
    id: `u${i}`, email: `student${i}@universe.edu`, password: 'student123', role: 'student',
    name: `Student Name ${i}`, avatar: `S${i}`, studentId: `STU202600${i}`,
    department: randItem(['Computer Science', 'Data Science', 'Mathematics', 'Physics', 'Biology']), year: rand(1, 4), semester: rand(1, 8),
    gpa: (rand(60, 100) / 10).toFixed(1), phone: `+33 6 12 34 56 ${i.toString().padStart(2, '0')}`, address: `${i} Rue de la Paix, Paris`,
    enrolledCourses: [], notifications: rand(0, 5), joinedOrgs: [randItem(orgs).id, randItem(orgs).id]
  };
  users.push(u);
  students.push(u);
}
const teachers = [];
for (let i = 1; i <= 15; i++) {
  const t = {
    id: `t${i}`, email: `teacher${i}@universe.edu`, password: 'teacher123', role: 'teacher',
    name: `Prof. Teacher Name ${i}`, avatar: `T${i}`, teacherId: `TCH202400${i}`,
    department: randItem(['Computer Science', 'Data Science', 'Mathematics', 'Physics', 'Biology']), designation: randItem(['Professor', 'Associate Professor', 'Lecturer']),
    phone: `+33 6 34 56 78 ${i.toString().padStart(2, '0')}`, coursesTaught: [], notifications: rand(0, 5)
  };
  users.push(t);
  teachers.push(t);
}
users.push({
  id: 'a1', email: 'admin@universe.edu', password: 'admin123', role: 'admin',
  name: 'Dr. Sophie Bernard', avatar: 'SB', adminId: 'ADM2024001',
  designation: 'University Registrar', phone: '+33 6 56 78 90 12', notifications: 15
});

// 4. Generate Courses (20+)
const courses = [];
const depts = ['CS', 'DS', 'Math', 'Phys', 'Bio'];
for (let i = 1; i <= 25; i++) {
  const dept = randItem(depts);
  const c = {
    id: `c${i}`, code: `${dept}${rand(100, 499)}`, name: `Course ${dept} ${i}`, department: dept, credits: rand(2, 4), color: randItem(['#6366f1', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#a78bfa']),
    professors: [randItem(teachers), randItem(teachers)].map(t => ({ id: t.id, name: t.name, role: 'Instructor', avatar: t.avatar, email: t.email, office: `Room ${rand(100,300)}` })),
    schedule: [{ day: randItem(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']), time: `${rand(8, 16).toString().padStart(2, '0')}:00`, room: `Room ${rand(100,300)}` }, { day: randItem(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']), time: `${rand(8, 16).toString().padStart(2, '0')}:00`, room: `Room ${rand(100,300)}` }],
    students: [], progress: rand(10, 90), syllabus: ['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5', 'Topic 6']
  };
  courses.push(c);
  // assign teachers
  c.professors.forEach(p => {
    const t = teachers.find(x => x.id === p.id);
    if (t && !t.coursesTaught.includes(c.id)) t.coursesTaught.push(c.id);
  });
}
// assign students to courses (each student gets 5 courses)
students.forEach(s => {
  const sc = [];
  while(sc.length < 5) {
    const c = randItem(courses);
    if (!sc.includes(c.id)) { sc.push(c.id); c.students.push(s.id); }
  }
  s.enrolledCourses = sc;
});
save('users.json', { users });
save('courses.json', { courses });

// 5. Generate Attendance
const attRecords = [];
const justifications = [];
courses.forEach(c => {
  const dates = ['2026-09-01', '2026-09-05', '2026-09-08', '2026-09-12', '2026-09-15', '2026-09-19', '2026-09-22', '2026-09-26', '2026-09-29'];
  c.students.forEach(sId => {
    dates.forEach(d => {
      const status = Math.random() > 0.2 ? 'present' : 'absent';
      attRecords.push({ studentId: sId, courseId: c.id, date: d, status });
      if (status === 'absent' && Math.random() > 0.5) {
        justifications.push({ id: `j${rand(1000,9999)}`, studentId: sId, courseId: c.id, date: d, reason: 'Medical', description: 'Felt sick', status: randItem(['pending', 'approved', 'rejected']), submittedAt: new Date().toISOString() });
      }
    });
  });
});
save('attendance.json', { records: attRecords, justifications });

// 6. Generate Materials & Quizzes
const materials = [];
const quizzes = [];
courses.forEach(c => {
  for (let i = 1; i <= 15; i++) {
    materials.push({
      id: `m_${c.id}_${i}`, courseId: c.id, title: `Lecture ${i} Slides - Comprehensive Overview`, type: randItem(['pdf', 'ppt', 'doc', 'link']),
      url: '#', uploadDate: new Date(Date.now() - rand(1, 30) * 86400000).toISOString(), size: `${rand(1, 15)} MB`
    });
  }
  for (let i = 1; i <= 5; i++) {
    const q = {
      id: `q_${c.id}_${i}`, courseId: c.id, title: `Quiz ${i}: Advanced Topics`, dueDate: new Date(Date.now() + rand(-10, 10) * 86400000).toISOString(),
      questions: [
        { question: 'What is the primary function of X?', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 'Option A' },
        { question: 'How does Y impact Z?', options: ['It increases Z', 'It decreases Z', 'No impact', 'Depends on context'], answer: 'It increases Z' },
        { question: 'Select the correct statement.', options: ['Statement 1 is true', 'Statement 2 is true', 'Both are true', 'None are true'], answer: 'Both are true' }
      ],
      submissions: []
    };
    c.students.forEach(sId => {
      if (Math.random() > 0.5) q.submissions.push({ studentId: sId, answers: ['Option A', 'It increases Z', 'Both are true'], score: rand(60, 100), submittedAt: new Date().toISOString() });
    });
    quizzes.push(q);
  }
});
save('materials.json', { materials, views: [] });
save('quizzes.json', { quizzes });

// 7. Generate Grades
const gradesData = { assignments: [], grades: [], semesterHistory: [] };
students.forEach(s => {
  s.enrolledCourses.forEach(cId => {
    for (let i = 1; i <= 4; i++) {
      gradesData.assignments.push({ id: `a_${s.id}_${cId}_${i}`, studentId: s.id, courseId: cId, title: `Assignment ${i}`, score: rand(60, 100), max: 100, dueDate: new Date().toISOString() });
    }
    const gp = rand(60, 100) / 10;
    gradesData.grades.push({ studentId: s.id, courseId: cId, grade: gp > 9 ? 'A' : gp > 8 ? 'B' : 'C', gradePoint: gp, classRank: { percentile: rand(1, 99), totalStudents: courses.find(c=>c.id===cId).students.length } });
  });
  for (let sem = 1; sem < s.semester; sem++) {
    gradesData.semesterHistory.push({ studentId: s.id, semester: `Sem ${sem}`, gpa: (rand(70, 100) / 10).toFixed(1) });
  }
});
save('grades.json', gradesData);

// 8. Generate Payments
const payInvoices = [];
const payTxns = [];
students.forEach(s => {
  for (let i = 1; i <= 5; i++) {
    const isPaid = Math.random() > 0.3;
    const inv = {
      id: `inv_${s.id}_${i}`, studentId: s.id, title: `Semester ${rand(1, 8)} Tuition Fee`, category: randItem(['Tuition', 'Library', 'Hostel', 'Misc']),
      amount: rand(100, 5000), dueDate: new Date(Date.now() + rand(-30, 30) * 86400000).toISOString(), status: isPaid ? 'paid' : 'pending',
      breakdown: [{ item: 'Base Fee', amount: rand(50, 4000) }, { item: 'Tax/Surcharge', amount: rand(10, 500) }]
    };
    if (isPaid) {
      inv.paidDate = new Date(Date.now() - rand(1, 30) * 86400000).toISOString();
      inv.receiptId = `REC-${rand(10000, 99999)}`;
      payTxns.push({ invoiceId: inv.id, studentId: s.id, method: 'card', brand: randItem(['Visa', 'Mastercard']), last4: rand(1000, 9999).toString(), date: inv.paidDate });
    }
    payInvoices.push(inv);
  }
});
save('payments.json', { invoices: payInvoices, transactions: payTxns });

// 9. Generate Notifications
const notifs = [];
users.forEach(u => {
  for (let i = 1; i <= 15; i++) {
    notifs.push({
      id: `n_${u.id}_${i}`, userId: u.id, type: randItem(['academic', 'social', 'payment', 'attendance', 'grade']),
      title: `Important Update ${i}`, message: `This is a detailed notification message regarding your recent activities. Please check the corresponding section for more details.`,
      read: Math.random() > 0.5, timestamp: new Date(Date.now() - rand(1, 100) * 3600000).toISOString(), link: 'home'
    });
  }
});
save('notifications.json', { notifications: notifs });

// 10. Generate WiFi Logs
const wifiLogs = [];
students.forEach(s => {
  for (let i = 1; i <= 10; i++) {
    wifiLogs.push({
      id: `w_${s.id}_${i}`, studentId: s.id, timestamp: new Date(Date.now() - rand(1, 100) * 3600000).toISOString(),
      apId: `AP-${randItem(['Library', 'Cafeteria', 'CS-Block', 'Math-Block', 'Hostel', 'Admin', 'Sports', 'Main-Gate'])}-${rand(1, 10)}`,
      deviceMac: `00:1A:2B:3C:4D:${rand(10, 99)}`, signalStrength: rand(-90, -40)
    });
  }
});
save('wifi_logs.json', { logs: wifiLogs });

console.log('Successfully generated large datasets for all sections!');
