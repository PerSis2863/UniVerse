'use strict';
const API = '';
const token = () => localStorage.getItem('universe_token');
const getUser = () => { try { return JSON.parse(localStorage.getItem('universe_user')); } catch { return null; } };
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { logout(); return null; }
  return res.json();
}
function logout() { localStorage.clear(); window.location.href = '/'; }
function closeMod(id) { document.getElementById(id).classList.remove('active'); }
function openMod(id) { document.getElementById(id).classList.add('active'); }

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const u = getUser();
  if (!u || u.role !== 'student') { window.location.href = '/'; return; }
  document.getElementById('sidebarUser').innerHTML = `<div class="user-av">${u.avatar||'AB'}</div><div class="user-info"><div class="user-name">${u.name}</div><div class="user-id">${u.studentId||''}</div></div>`;
  document.getElementById('avatarChip').textContent = u.avatar || 'AB';
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => switchSection(item.dataset.sec)));
  document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('active'); }));
  await loadNotifications();
  await loadHome();
});

// ── NAVIGATION ────────────────────────────────────────────────
const META = {
  home:       { title: 'Dashboard', sub: 'Welcome back to UniVerse' },
  attendance: { title: 'Attendance', sub: 'Track your presence & submit absence justifications' },
  courses:    { title: 'My Courses', sub: '8 courses · Click any course for full details' },
  grades:     { title: 'Grades & GPA', sub: 'Your academic performance this semester' },
  timetable:  { title: 'Timetable', sub: 'Weekly, monthly & semester schedule views' },
  knowledge:  { title: 'Knowledge Hub', sub: 'Access library resources, study materials, and research databases' },
  quizzes:    { title: 'Quizzes', sub: 'Test your knowledge and submit answers' },
  career:     { title: 'Career Center', sub: 'Find internships, apprenticeships, and jobs' },
  alumni:     { title: 'Alumni Network', sub: 'Connect with graduates and mentors (Together)' },
  documents:  { title: 'Official Documents', sub: 'Download transcripts and enter administrative info' },
  inbox:      { title: 'Inbox & Reports', sub: 'Messaging and incident reporting' },
  collab:     { title: 'Collaboration', sub: 'Projects across universities, NGOs, businesses & IT' },
  impact:     { title: 'Social Impact', sub: 'Your contribution to a better world' },
  payments:   { title: 'Payments', sub: 'Fee management, invoices & payment history' }
};
const loaders = { home: loadHome, attendance: loadAttendance, courses: loadCourses, grades: loadGrades, timetable: loadTimetable, knowledge: loadKnowledge, quizzes: loadQuizzes, career: loadCareer, alumni: loadAlumni, documents: loadDocuments, inbox: loadInbox, collab: loadCollab, impact: loadImpact, payments: loadPayments };

function switchSection(id) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`sec-${id}`).classList.add('active');
  document.querySelector(`[data-sec="${id}"]`).classList.add('active');
  const m = META[id];
  document.getElementById('pageTitle').textContent = m.title;
  document.getElementById('pageSub').textContent = m.sub;
  if (loaders[id]) loaders[id]();
}

function animNum(el, target, suffix = '', dur = 900) {
  if (!el) return;
  const s = performance.now();
  const num = parseFloat(target);
  const isFloat = !Number.isInteger(num);
  const step = now => {
    const p = Math.min((now - s) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    const v = isFloat ? (num * e).toFixed(1) : Math.round(num * e);
    el.textContent = v + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── NOTIFICATIONS ──────────────────────────────────────────────
let notifData = [];
async function loadNotifications() {
  const data = await api('/api/notifications');
  if (!data) return;
  notifData = data.notifications;
  renderNotifBadge(data.unread);
  renderNotifList();
}
function renderNotifBadge(count) {
  const badge = document.getElementById('notifBadge');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}
function renderNotifList() {
  const icons = { grade: '🏆', payment: '💳', attendance: '📊', academic: '📚', social: '🤝' };
  const bgColors = { grade: 'rgba(245,158,11,.15)', payment: 'rgba(99,102,241,.15)', attendance: 'rgba(244,63,94,.15)', academic: 'rgba(6,182,212,.15)', social: 'rgba(16,185,129,.15)' };
  document.getElementById('notifList').innerHTML = notifData.length ? notifData.map(n => `
    <div class="notif-item ${!n.read ? 'unread' : ''}" onclick="markRead('${n.id}','${n.link}')">
      <div class="notif-icon" style="background:${bgColors[n.type]||'var(--surface)'}">${icons[n.type]||'📢'}</div>
      <div class="notif-body"><div class="notif-title">${n.title}</div><div class="notif-msg">${n.message}</div><div class="notif-time">${timeAgo(n.timestamp)}</div></div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`).join('') : '<div class="empty-state">🎉 You\'re all caught up!</div>';
}
function toggleNotifPanel() {
  document.getElementById('notifPanel').classList.toggle('open');
  document.getElementById('notifOverlay').classList.toggle('open');
}
function closeNotifPanel() {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('notifOverlay').classList.remove('open');
}
async function markRead(id, link) {
  await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ id }) });
  const n = notifData.find(x => x.id === id);
  if (n) n.read = true;
  renderNotifBadge(notifData.filter(x => !x.read).length);
  renderNotifList();
  if (link) { closeNotifPanel(); switchSection(link); }
}
async function markAllRead() {
  await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ id: 'all' }) });
  notifData.forEach(n => n.read = true);
  renderNotifBadge(0);
  renderNotifList();
}
function showToast(title, msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<div class="toast-icon">${icons[type]}</div><div class="toast-body"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 400); }, 4000);
}

// ── HOME ──────────────────────────────────────────────────────
async function loadHome() {
  const data = await api('/api/student/dashboard');
  if (!data) return;
  // Welcome
  const h = new Date().getHours();
  const greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  document.getElementById('welcomeBanner').innerHTML = `
    <div class="welcome-text">
      <h2 style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;letter-spacing:-0.5px">Good ${greeting}, ${data.user.name.split(' ')[0]}! 👋</h2>
      <p style="color:var(--muted);margin-top:8px;font-size:14px;font-weight:500"><span style="color:var(--text);padding:2px 6px;background:rgba(255,255,255,0.1);border-radius:4px">${data.user.studentId}</span> &middot; ${data.user.department} &middot; Year ${data.user.year} &middot; ${data.user.email}</p>
      <p style="color:var(--muted);margin-top:4px;font-size:12px">${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</p>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn-primary" onclick="switchSection('courses')" style="font-size:12px;padding:7px 14px">📚 View Courses</button>
        <button class="btn-primary" onclick="switchSection('payments')" style="font-size:12px;padding:7px 14px;background:var(--rose)">💳 Pay Fees</button>
        <button class="btn-primary" onclick="switchSection('attendance')" style="font-size:12px;padding:7px 14px;background:var(--surface2)">📊 Attendance</button>
      </div>
    </div>
    <div style="font-size:64px;line-height:1">🎓</div>
  `;
  
  if (document.getElementById('studentProfileInfo')) {
    document.getElementById('studentProfileInfo').innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; color: var(--muted); font-size: 14px;">
        <div><strong>Full Name:</strong> <span style="color:var(--text)">${data.user.name}</span></div>
        <div><strong>Email:</strong> <span style="color:var(--text)">${data.user.email}</span></div>
        <div><strong>Department:</strong> <span style="color:var(--text)">${data.user.department}</span></div>
        <div><strong>Enrollment Year:</strong> <span style="color:var(--text)">Year ${data.user.year}</span></div>
        <div><strong>Academic Standing:</strong> <span style="color:var(--green)">Good Standing</span></div>
        <div><strong>Advisor:</strong> <span style="color:var(--text)">Prof. Alan Turing</span></div>
      </div>
    `;
  }
  // KPIs
  document.getElementById('homeKpis').innerHTML = [
    ['📚','Courses',data.stats.totalCourses,'Enrolled this semester','var(--surface2)','kCourses',''],
    ['📊','Attendance',data.stats.attendancePct,'% overall','var(--surface2)','kAtt','%'],
    ['🏆','GPA',data.stats.gpa,'Out of 10.0','var(--surface2)','kGpa',''],
    ['💳','Pending Fees',data.stats.pendingFees,'€ due soon','var(--surface2)','kFees',''],
  ].map(([ic,l,v,m,g,elId,suf]) => `<div class="kpi" style="--kpi-grad:${g}"><div class="kpi-icon">${ic}</div><div class="kpi-lbl">${l}</div><div class="kpi-val" id="${elId}">0</div><div class="kpi-meta">${m}</div></div>`).join('');
  setTimeout(() => {
    animNum(document.getElementById('kCourses'), data.stats.totalCourses);
    animNum(document.getElementById('kAtt'), data.stats.attendancePct, '%');
    animNum(document.getElementById('kGpa'), data.stats.gpa);
    animNum(document.getElementById('kFees'), data.stats.pendingFees);
  }, 100);
  // Today's classes
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('en',{weekday:'long'});
  const tc = document.getElementById('todayClasses');
  tc.innerHTML = data.todayClasses.length ? data.todayClasses.map(c => `
    <div class="class-item">
      <div class="class-color" style="background:${c.color}"></div>
      <div class="class-info"><div class="class-name">${c.course}</div><div class="class-meta">📍 ${c.room} · ${c.code}</div></div>
      <div class="class-time">${c.time}</div>
    </div>`).join('') : '<div class="empty-state">🎉 No classes today!</div>';
  // Deadlines
  document.getElementById('upcomingDeadlines').innerHTML = data.upcomingDeadlines.map(a => `
    <div class="deadline-item">
      <div><div class="dl-course" style="font-size:11px;color:var(--muted)">${a.courseId}</div><div class="dl-name" style="font-size:13px;font-weight:600;margin-top:2px">${a.title}</div></div>
      <div class="dl-date" style="font-size:12px;font-weight:700;color:var(--amber);white-space:nowrap">${new Date(a.dueDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
    </div>`).join('');
  // Activity
  document.getElementById('recentActivity').innerHTML = data.recentActivity.map(a => `
    <div class="activity-item">
      <div class="activity-icon">${a.icon}</div>
      <div class="activity-text">${a.text}</div>
      <div class="activity-time">${a.time}</div>
    </div>`).join('');
  // Attendance chart
  const attData = await api('/api/student/attendance');
  if (attData) {
    const ctx = document.getElementById('homeAttChart').getContext('2d');
    new Chart(ctx, { type: 'bar', data: { labels: attData.byCourse.map(c => c.code), datasets: [{ label: 'Attendance %', data: attData.byCourse.map(c => c.pct), backgroundColor: attData.byCourse.map(c => c.color + 'bb'), borderColor: attData.byCourse.map(c => c.color), borderWidth: 2, borderRadius: 8 }, { label: '75% Minimum', data: Array(attData.byCourse.length).fill(75), type: 'line', borderColor: 'rgba(245,158,11,.7)', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, fill: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8896b3', font: { family: 'Inter', size: 12 }, boxWidth: 12 } }, tooltip: { backgroundColor: 'rgba(13,20,36,.95)', cornerRadius: 10, padding: 12 } }, scales: { x: { ticks: { color: '#4a5578' }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { max: 100, ticks: { color: '#4a5578', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
  }
}

// ── ATTENDANCE ────────────────────────────────────────────────
let attCache = null;
function switchAttTab(btn, tab) {
  document.querySelectorAll('.att-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.att-tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`att-${tab}`).classList.add('active');
}

async function loadAttendance() {
  const data = await api('/api/student/attendance');
  if (!data) return;
  attCache = data;
  // Populate justify dropdown
  const sel = document.getElementById('justifyCourseDate');
  const absentRecs = [];
  data.byCourse.forEach(c => c.records.forEach(r => { if (r.status === 'absent' && !r.justification) absentRecs.push({ ...r, courseName: c.courseName }); }));
  sel.innerHTML = '<option value="">— Select absent session —</option>' + absentRecs.map(r => `<option value="${r.courseId}|${r.date}">${r.courseName} · ${r.date}</option>`).join('');
  if (absentRecs.length > 0) { document.getElementById('pendingJustBadge').style.display = 'inline-flex'; document.getElementById('pendingJustBadge').textContent = absentRecs.length; }
  renderAttOverview(data);
  renderAttCalendar(data);
  renderJustifHistory(data);
}

function renderAttOverview(data) {
  const pct = data.overall;
  const color = pct >= 75 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#f43f5e';
  const circ = 2 * Math.PI * 44;
  document.getElementById('attOverallCard').innerHTML = `
    <div style="position:relative;width:108px;height:108px;flex-shrink:0">
      <svg width="108" height="108"><circle cx="54" cy="54" r="44" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="9"/><circle cx="54" cy="54" r="44" fill="none" stroke="${color}" stroke-width="9" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-pct/100)}" stroke-linecap="round" transform="rotate(-90 54 54)" style="transition:stroke-dashoffset 1.4s ease"/></svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Outfit',sans-serif;font-size:22px;font-weight:900;color:${color}">${pct}%</div>
    </div>
    <div style="flex:1">
      <h2 style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800">Overall Attendance: ${pct}%</h2>
      <p style="color:var(--muted);font-size:13px;margin-top:6px;line-height:1.5">${pct >= 75 ? '✅ You are above the 75% minimum. Keep it up!' : '⚠️ Your attendance is below 75% minimum. Risk of academic penalty.'}</p>
      <div style="display:flex;gap:20px;margin-top:16px;flex-wrap:wrap">
        ${data.byCourse.map(c => `<div style="text-align:center"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">${c.code}</div><div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:800;color:${c.pct>=75?'var(--green)':'var(--rose)'}">${c.pct}%</div></div>`).join('')}
      </div>
    </div>`;
  document.getElementById('attByCourse').innerHTML = data.byCourse.map(c => `
    <div class="att-course-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:.6px;text-transform:uppercase">${c.code}</div>
          <div style="font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;margin-top:2px">${c.courseName}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">${c.professors?.map(p=>p.name.split(' ').slice(-1)[0]).join(', ')||''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Outfit',sans-serif;font-size:26px;font-weight:900;color:${c.pct>=75?'var(--green)':c.pct>=60?'var(--amber)':'var(--rose)'}">${c.pct}%</div>
          ${c.atRisk ? '<div style="font-size:10px;color:var(--rose);font-weight:700">⚠ AT RISK</div>' : ''}
        </div>
      </div>
      <div class="att-bar-track"><div class="att-bar" style="width:${c.pct}%;background:${c.color}"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:8px"><span>✅ Present: ${c.present}</span><span>❌ Absent: ${c.absent}</span><span>Total: ${c.total}</span></div>
      <div style="margin-top:12px">
        ${c.records.slice(-6).map(r => `
          <div class="att-record-row ${r.status==='absent'?'absent-row':''}" onclick="${r.status==='absent'&&!r.justification?`setJustifyDate('${c.courseId}','${r.date}')`:''}" style="color:${r.status==='present'?'var(--muted)':''}">
            <span>${new Date(r.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:600;color:${r.status==='present'?'var(--green)':'var(--rose)'}">${r.status==='present'?'Present':'Absent'}</span>
              ${r.status==='absent'&&!r.justification?'<span class="justify-link">Justify →</span>':''}
              ${r.justification?`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(6,182,212,.1);color:#67e8f9;border:1px solid rgba(6,182,212,.2)">Justified · ${r.justification.status}</span>`:''}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function renderAttCalendar(data) {
  const byDate = {};
  data.allRecords.forEach(r => { byDate[r.date] = byDate[r.date] || {}; byDate[r.date][r.status] = (byDate[r.date][r.status] || 0) + 1; });
  const justDates = new Set(data.justifications.map(j => j.date));
  const dates = Object.keys(byDate).sort();
  if (!dates.length) { document.getElementById('attCalendar').innerHTML = '<div class="empty-state">No records yet.</div>'; return; }
  const cells = dates.map(d => { const s = byDate[d]; const pres = s.present || 0; const tot = Object.values(s).reduce((a, b) => a + b, 0); const isJust = justDates.has(d); const col = isJust ? '#06b6d4' : pres === tot ? '#10b981' : pres === 0 ? '#f43f5e' : '#f59e0b'; const label = isJust ? 'J' : pres === tot ? '✓' : '✗'; return `<div title="${d}: ${pres}/${tot} present${isJust?' (Justified)':''}" style="width:38px;height:38px;border-radius:8px;background:${col}20;border:1px solid ${col}44;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${col};cursor:default;flex-direction:column;gap:1px"><span>${label}</span><span style="font-size:9px;opacity:.7">${new Date(d).getDate()}</span></div>`; }).join('');
  document.getElementById('attCalendar').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">${cells}</div><div style="display:flex;gap:16px;margin-top:14px;font-size:12px;color:var(--muted)"><span style="color:#10b981">✅ Present</span><span style="color:#f59e0b">🟡 Partial</span><span style="color:#f43f5e">❌ Absent</span><span style="color:#06b6d4">🔵 Justified</span></div>`;
}

function renderJustifHistory(data) {
  const el = document.getElementById('justifHistory');
  if (!data.justifications.length) { el.innerHTML = '<div class="empty-state">No justifications submitted yet.</div>'; return; }
  el.innerHTML = data.justifications.map(j => {
    const statusColor = { pending: '#f59e0b', approved: '#10b981', rejected: '#f43f5e' }[j.status] || '#6366f1';
    return `<div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="width:42px;height:42px;border-radius:10px;background:rgba(99,102,241,.1);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">📎</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:600">${j.reason} — ${j.date}</div><div style="font-size:12px;color:var(--muted);margin-top:3px;line-height:1.4">${j.description}</div>${j.photoUrl?`<div style="margin-top:8px"><img src="${j.photoUrl}" style="width:80px;height:60px;border-radius:8px;object-fit:cover;border:1px solid var(--border)"/></div>`:''}</div>
      <span style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;background:${statusColor}20;color:${statusColor};border:1px solid ${statusColor}40">${j.status}</span>
    </div>`;
  }).join('');
}

function setJustifyDate(courseId, date) {
  switchAttTab(document.querySelector('[data-tab="justify"]'), 'justify');
  document.querySelector('[data-tab="justify"]').classList.add('active');
  document.querySelectorAll('.att-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="justify"]').classList.add('active');
  const sel = document.getElementById('justifyCourseDate');
  for (const opt of sel.options) { if (opt.value === `${courseId}|${date}`) { sel.value = opt.value; break; } }
}

let uploadedFileUrl = null;
function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('filePreview');
  preview.style.display = 'block';
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => { uploadedFileUrl = e.target.result; preview.innerHTML = `<div class="file-preview"><img src="${e.target.result}" class="file-img-thumb"/><div><div style="font-size:13px;font-weight:600">${file.name}</div><div style="font-size:12px;color:var(--muted)">${(file.size/1024).toFixed(0)} KB · Image</div></div><button onclick="removeFile()" style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.2);color:var(--rose);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Remove</button></div>`; };
    reader.readAsDataURL(file);
  } else { uploadedFileUrl = `file://${file.name}`; preview.innerHTML = `<div class="file-preview"><div style="font-size:30px">📄</div><div><div style="font-size:13px;font-weight:600">${file.name}</div><div style="font-size:12px;color:var(--muted)">${(file.size/1024).toFixed(0)} KB · PDF</div></div><button onclick="removeFile()" style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.2);color:var(--rose);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Remove</button></div>`; }
}
function removeFile() { uploadedFileUrl = null; document.getElementById('filePreview').style.display = 'none'; document.getElementById('fileInput').value = ''; }

async function submitJustification() {
  const sel = document.getElementById('justifyCourseDate').value;
  if (!sel) { showToast('Missing Info', 'Please select an absent session.', 'warning'); return; }
  const [courseId, date] = sel.split('|');
  const reason = document.getElementById('justifyReason').value;
  const description = document.getElementById('justifyDesc').value.trim();
  if (!description) { showToast('Missing Info', 'Please provide a description of your absence.', 'warning'); return; }
  const btn = event.target; btn.disabled = true; btn.textContent = '📤 Submitting...';
  const res = await api('/api/student/attendance/justify', { method: 'POST', body: JSON.stringify({ courseId, date, reason, description, photoUrl: uploadedFileUrl }) });
  btn.disabled = false; btn.textContent = '📤 Submit to University Registrar';
  if (res?.success) {
    showToast('Submitted!', 'Your justification has been sent to the University Registrar.', 'success');
    document.getElementById('justifyDesc').value = ''; removeFile();
    await loadAttendance();
  } else { showToast('Error', res?.error || 'Submission failed. Please try again.', 'error'); }
}

// ── COURSES ──────────────────────────────────────────────────
let coursesCache = [];
async function loadCourses() {
  const data = await api('/api/student/courses');
  if (!data) return;
  coursesCache = data.courses;
  renderCourses('all');
}
function filterCourses(btn, dept) {
  document.querySelectorAll('.course-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCourses(dept);
}
function renderCourses(dept) {
  const filtered = dept === 'all' ? coursesCache : coursesCache.filter(c => c.department === dept);
  document.getElementById('coursesGrid').innerHTML = filtered.map(c => `
    <div class="course-card" onclick="openCourseModal('${c.id}')">
      <div class="course-card-top" style="--c-color:${c.color}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:1px;text-transform:uppercase">${c.code}</div>
            <div style="font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;margin:5px 0">${c.name}</div>
            <div style="font-size:11px;color:var(--muted)">${c.department} · ${c.credits} Credits</div>
          </div>
          <div style="width:14px;height:14px;border-radius:50%;background:${c.color};box-shadow:0 0 8px ${c.color}66"></div>
        </div>
        <div class="professors-row" style="margin-top:12px">
          ${c.professors.map(p => `<div class="prof-av" title="${p.name} · ${p.role}" style="background:var(--surface2)">${p.avatar}</div>`).join('')}
          <div style="font-size:12px;color:var(--muted);margin-left:10px;align-self:center">${c.professors.length} Professor${c.professors.length>1?'s':''}</div>
        </div>
        <div class="course-progress"><div class="course-progress-fill" style="width:${c.progress}%;background:${c.color}"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px"><span>Syllabus ${c.progress}% covered</span><span>${c.assignments?.length||0} assignments</span></div>
      </div>
      <div style="padding:14px 18px;display:flex;gap:8px;flex-wrap:wrap">
        ${c.schedule.map(s => `<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--muted)">${s.day} ${s.time} · ${s.room}</span>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty-state">No courses in this department.</div>';
}

function openCourseModal(id) {
  const c = coursesCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('courseModalContent').innerHTML = `
    <div style="border-bottom:1px solid var(--border);padding-bottom:20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:56px;height:56px;border-radius:14px;background:${c.color}20;border:2px solid ${c.color}44;display:flex;align-items:center;justify-content:center;font-size:24px">📚</div>
        <div><div style="font-size:11px;color:var(--muted);font-weight:700;letter-spacing:1px;text-transform:uppercase">${c.code}</div><div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:800;margin:3px 0">${c.name}</div><div style="display:flex;gap:8px"><span class="badge-pill">${c.department}</span><span class="badge-pill">${c.credits} Credits</span><span class="badge-pill">${c.progress}% covered</span></div></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:12px">👨‍🏫 Instructors</h4>
        ${c.professors.map(p => `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0">${p.avatar}</div>
          <div style="flex:1"><div style="font-size:13px;font-weight:700">${p.name}</div><div style="font-size:11px;color:var(--muted)">${p.role}</div><div style="font-size:11px;color:var(--muted)">${p.email}</div></div>
          <div style="font-size:11px;color:var(--muted);text-align:right">${p.office}</div>
        </div>`).join('')}
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin:16px 0 12px">📅 Schedule</h4>
        ${c.schedule.map(s => `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="font-size:12px;font-weight:700;color:#a5b4fc;width:32px">${s.day}</span><span style="font-size:13px">${s.time}</span><span style="font-size:12px;color:var(--muted)">📍 ${s.room}</span></div>`).join('')}
      </div>
      <div>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:12px">📖 Syllabus</h4>
        ${c.syllabus.map((t,i) => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px"><span style="color:var(--muted);font-size:11px;font-weight:700;width:20px">${i+1}</span><span>${t}</span></div>`).join('')}
        ${c.assignments?.length ? `<h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin:16px 0 12px">📝 Assignments</h4>${c.assignments.map(a => `<div style="padding:12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:10px;margin-bottom:8px"><div style="font-size:13px;font-weight:700">${a.title}</div><div style="font-size:12px;color:var(--amber);margin-top:3px">Due: ${new Date(a.dueDate).toLocaleDateString('en-GB',{day:'numeric',month:'long'})}</div><div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5">${a.details}</div></div>`).join('')}` : ''}
      </div>
    </div>`;
  openMod('courseModal');
}

// ── GRADES ───────────────────────────────────────────────────
async function loadGrades() {
  const data = await api('/api/student/grades');
  if (!data) return;
  // Hero GPA card
  document.getElementById('gpaHeroCard').innerHTML = `
    <div style="padding: 10px;">
      <div class="gpa-big" style="font-size:56px;line-height:1;margin-bottom:8px;">${data.gpa}</div>
      <div class="gpa-label" style="font-size:14px;letter-spacing:1px;">Current SGPA</div>
      <div style="margin-top:12px;font-size:13px;font-weight:600;color:var(--muted)">${data.gpa>=9.5?'🏆 Outstanding':data.gpa>=9?'⭐ Excellent':data.gpa>=8?'👍 Very Good':data.gpa>=7?'📚 Good':'💪 Keep going'}</div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)">
        <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Credits Earned</div>
        <div style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;color:#06b6d4">${data.grades.reduce((s,g)=>{const c=coursesCache.find(c=>c.id===g.courseId);return s+(c?.credits||0);},0)} / ${coursesCache.reduce((s,c)=>s+(c.credits||0),0)}</div>
      </div>
    </div>`;
  // GPA Trend
  setTimeout(() => {
    const ctx1 = document.getElementById('gpaTrendChart')?.getContext('2d');
    if (ctx1 && data.semesterHistory) {
      new Chart(ctx1, { type: 'line', data: { labels: data.semesterHistory.map(s => s.semester), datasets: [{ label: 'SGPA', data: data.semesterHistory.map(s => s.gpa), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.12)', fill: true, tension: .4, borderWidth: 2.5, pointBackgroundColor: '#6366f1', pointRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#4a5578', font: { size: 9 } }, grid: { display: false } }, y: { min: 6, max: 10, ticks: { color: '#4a5578', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' } } } } });
    }
    // Radar chart
    const ctx2 = document.getElementById('skillRadar')?.getContext('2d');
    if (ctx2) {
      new Chart(ctx2, { type: 'radar', data: { labels: ['Algorithms','ML','Math','Stats','Cloud','Security'], datasets: [{ label: 'Score', data: [90,81,91,79,90,85], borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.15)', borderWidth: 2, pointBackgroundColor: '#6366f1', pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,.06)' }, pointLabels: { color: '#8896b3', font: { size: 10 } }, min: 0, max: 100 } } } });
    }
  }, 100);
  // Grade cards
  document.getElementById('gradesCards').innerHTML = data.grades.map(g => {
    const avgScore = g.assignments.length ? Math.round(g.assignments.reduce((s, a) => s + a.score, 0) / g.assignments.length) : 0;
    const pred = g.gradePoint >= 9.5 ? 'A+' : g.gradePoint >= 9 ? 'A' : g.gradePoint >= 8.5 ? 'A-' : 'B+';
    const c = coursesCache.find(x => x.id === g.courseId);
    const credits = c?.credits || 3;
    const profs = c?.professors?.map(p => p.name).join(', ') || 'Staff';
    return `<div class="grade-card" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;transition:transform 0.2s">
      <div class="grade-card-top" style="display:flex;gap:16px;align-items:flex-start">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--surface2);border:1px solid ${g.color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff">${g.courseCode.substring(0,2)}</div>
        <div class="grade-main" style="flex:1">
          <div class="grade-name" style="font-size:16px;font-weight:700;letter-spacing:-0.3px">${g.courseName}</div>
          <div class="grade-code" style="font-size:12px;color:var(--muted);margin-top:2px">${g.courseCode} &middot; ${credits} Credits &middot; Prof. ${profs}</div>
          ${g.classRank ? `<div class="grade-rank" style="margin-top:8px;display:inline-block;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:12px;font-size:10px;color:#a5b4fc">🏆 Top ${100-g.classRank.percentile}% of ${g.classRank.totalStudents}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div class="grade-letter" style="font-size:32px;font-weight:900;line-height:1;background:var(--surface2);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${g.grade}</div>
          <div class="grade-pt" style="font-size:13px;font-weight:700;color:var(--green);margin-top:4px">${g.gradePoint} / 10</div>
        </div>
      </div>
      
      <div style="margin-top:16px;padding-top:16px;border-top:1px dashed rgba(255,255,255,0.1)">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px;font-weight:600">Assignments</div>
        <div class="grade-asgns" style="display:flex;gap:8px;flex-wrap:wrap">
          ${g.assignments.map(a => { const pct = Math.round(a.score/a.max*100); return `<div class="grade-asgn-chip" style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:6px 10px"><div style="font-size:10px;color:var(--muted)">${a.name}</div><div class="asgn-score" style="font-weight:700;font-size:12px;color:${pct>=85?'var(--green)':pct>=70?'var(--amber)':'var(--rose)'}">${a.score}/${a.max}</div></div>`; }).join('')}
          <div class="grade-asgn-chip" style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);border-radius:8px;padding:6px 10px"><div style="font-size:10px;color:var(--muted)">Prediction</div><div class="asgn-score" style="font-weight:700;font-size:12px;color:#a5b4fc">${pred}</div></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);margin-top:16px;margin-bottom:6px"><span>Average Score</span><span>${avgScore}%</span></div>
      <div style="height:6px;background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden"><div style="height:100%;width:${avgScore}%;background:var(--surface2);border-radius:3px;transition:width 1.2s ease"></div></div>
    </div>`;
  }).join('');
}

// ── TIMETABLE ───────────────────────────────────────────────
let ttCurrentView = 'week';
let ttCurrentMonth = new Date();
let ttCoursesCache = null;

async function loadTimetable() {
  if (!ttCoursesCache) {
    const data = await api('/api/student/courses');
    if (!data) return;
    ttCoursesCache = data.courses;
  }
  renderTTWeek();
  renderTTMonth();
  renderTTSemester();
}

function switchTTView(v) {
  ttCurrentView = v;
  document.querySelectorAll('.tt-view').forEach(x => x.classList.remove('active'));
  document.getElementById(`tt${v.charAt(0).toUpperCase()+v.slice(1)}View`).classList.add('active');
  document.querySelectorAll('.tt-controls .filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`ttView${v.charAt(0).toUpperCase()+v.slice(1)}`).classList.add('active');
}

function renderTTWeek() {
  if (!ttCoursesCache) return;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const times = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
  const slotMap = {};
  ttCoursesCache.forEach(c => c.schedule.forEach(s => { slotMap[`${s.day}-${s.time}`] = { name: c.name, code: c.code, room: s.room, color: c.color, profs: c.professors.map(p=>p.name.split(' ').slice(-1)[0]).join(', ') }; }));
  const todayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
  document.getElementById('ttWeekView').innerHTML = `<div class="card"><div class="card-hdr"><h3>Weekly Schedule</h3><span class="badge-pill">Semester 6 · 2026</span></div><div class="tt-week-grid"><table class="tt-table"><thead><tr><th style="width:70px">Time</th>${days.map(d=>`<th class="${d===todayName?'today-col':''}">${d}${d===todayName?' 🔵':''}</th>`).join('')}</tr></thead><tbody>${times.map(t=>`<tr><td style="color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap">${t}</td>${days.map(d=>{const s=slotMap[`${d}-${t}`];return s?`<td><div class="tt-cell" style="--c:${s.color}" onclick="showClassPopup('${s.name}','${s.room}','${s.profs}','${t}')"><div class="tt-cell-name">${s.name}</div><div class="tt-cell-room">📍 ${s.room}</div><div style="font-size:10px;color:${s.color};margin-top:2px">${s.profs}</div></div></td>`:`<td></td>`;}).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function showClassPopup(name, room, profs, time) {
  showToast(name, `📍 ${room} · 🕐 ${time} · 👨‍🏫 ${profs}`, 'info');
}

function jumpToToday() { ttCurrentMonth = new Date(); renderTTMonth(); showToast('Today', `Jumped to ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}`, 'info'); }

function renderTTMonth() {
  if (!ttCoursesCache) return;
  const d = ttCurrentMonth;
  const y = d.getFullYear(); const m = d.getMonth();
  const firstDay = new Date(y, m, 1).getDay(); const daysInMonth = new Date(y, m+1, 0).getDate();
  const slotMap = {}; const dayMap = { 0:'Sun',1:'Mon',2:'Tue',3:'Wed',4:'Thu',5:'Fri',6:'Sat' };
  ttCoursesCache.forEach(c => c.schedule.forEach(s => { if (!slotMap[s.day]) slotMap[s.day]=[]; slotMap[s.day].push({ name: c.name, color: c.color, time: s.time, room: s.room }); }));
  const today = new Date(); const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let cells = '';
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < startOffset; i++) cells += `<div class="cal-day other-month"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(y, m, day); const dName = dayMap[date.getDay()];
    const isToday = date.toDateString() === today.toDateString();
    const events = slotMap[dName] || [];
    cells += `<div class="cal-day ${isToday?'today':''}"><div class="cal-day-num">${day}</div>${events.slice(0,2).map(e=>`<div class="cal-event" style="background:${e.color}22;color:${e.color}">${e.name.split(' ')[0]}</div>`).join('')}${events.length>2?`<div class="cal-event" style="background:rgba(255,255,255,.05);color:var(--muted)">+${events.length-2} more</div>`:''}</div>`;
  }
  document.getElementById('ttMonthView').innerHTML = `<div class="card"><div class="cal-month"><div class="cal-hdr"><button class="cal-nav" onclick="changeMonth(-1)">‹ Prev</button><h3 style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700">${d.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</h3><button class="cal-nav" onclick="changeMonth(1)">Next ›</button></div><div class="cal-grid">${dayNames.map(d=>`<div class="cal-day-hdr">${d.substring(0,3)}</div>`).join('')}${cells}</div></div></div>`;
}

function changeMonth(dir) { ttCurrentMonth = new Date(ttCurrentMonth.getFullYear(), ttCurrentMonth.getMonth()+dir, 1); renderTTMonth(); }

function renderTTSemester() {
  if (!ttCoursesCache) return;
  const slotMap = {}; ttCoursesCache.forEach(c => c.schedule.forEach(s => { if (!slotMap[s.day]) slotMap[s.day]=[]; slotMap[s.day].push({ color: c.color, code: c.code }); }));
  const dayAbbr = ['Mo','Tu','We','Th','Fr','Sa'];
  const dayFull = ['Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = [{ name:'Sep 2026', start: new Date(2026,8,1), end: new Date(2026,8,30) }, { name:'Oct 2026', start: new Date(2026,9,1), end: new Date(2026,9,31) }, { name:'Nov 2026', start: new Date(2026,10,1), end: new Date(2026,10,30) }, { name:'Dec 2026', start: new Date(2026,11,1), end: new Date(2026,11,31) }, { name:'Jan 2027', start: new Date(2027,0,1), end: new Date(2027,0,24) }];
  const today = new Date();
  const html = months.map(mo => {
    const weeks = []; let week = new Array(6).fill(null); let d = new Date(mo.start); const start0 = mo.start.getDay() || 7;
    while (d <= mo.end) {
      const di = d.getDay(); if (di >= 1 && di <= 6) { week[di-1] = new Date(d); } if (di === 0 || +d === +mo.end) { weeks.push([...week]); week = new Array(6).fill(null); } d.setDate(d.getDate()+1);
    }
    const cols = dayFull.map((day, di) => `<div class="sem-day-col"><div class="sem-day-hdr">${dayAbbr[di]}</div>${weeks.map(w => { const wd = w[di]; if (!wd) return `<div class="sem-day-cell" style="background:transparent"></div>`; const events = slotMap[day]||[]; const isToday = wd.toDateString()===today.toDateString(); if (!events.length) return `<div class="sem-day-cell" style="background:rgba(255,255,255,.02);color:var(--dim)">${wd.getDate()}</div>`; return `<div class="sem-day-cell has-class ${isToday?'today-cell':''}" style="background:${events[0].color}33;color:${events[0].color}" title="${events.map(e=>e.code).join(', ')}">${wd.getDate()}</div>`; }).join('')}</div>`).join('');
    return `<div class="sem-month-block"><div class="sem-month-title">${mo.name}</div><div class="sem-week-row">${cols}</div></div>`;
  }).join('');
  document.getElementById('ttSemesterView').innerHTML = `<div class="card"><div class="card-hdr"><h3>Full Semester View</h3><div style="display:flex;gap:12px;font-size:12px;color:var(--muted);flex-wrap:wrap">${ttCoursesCache.map(c=>`<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block"></span>${c.code}</span>`).join('')}</div></div><div class="semester-scroll"><div class="semester-track">${html}</div></div></div>`;
}

// ── COLLABORATION ────────────────────────────────────────────
let collabCache = [];
async function loadCollab() {
  const data = await api('/api/collaboration');
  if (!data) return;
  collabCache = data.projects;
  renderCollabStats(data.projects);
  renderCollabGrid('all');
}
function filterCollab(btn, cat) {
  document.querySelectorAll('.collab-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCollabGrid(cat);
}
function renderCollabStats(projects) {
  const total = projects.length; const joined = projects.filter(p=>p.userJoined).length; const active = projects.filter(p=>p.status==='active').length; const members = projects.reduce((s,p)=>s+p.members,0);
  document.getElementById('collabStats').innerHTML = [
    ['🌍','Total Projects',total,'var(--surface2)'],
    ['✅','Joined',joined,'var(--surface2)'],
    ['🔥','Active',active,'var(--surface2)'],
    ['👥','Total Members',members.toLocaleString(),'var(--surface2)'],
  ].map(([ic,l,v,g]) => `<div class="kpi" style="--kpi-grad:${g}"><div class="kpi-icon">${ic}</div><div class="kpi-lbl">${l}</div><div class="kpi-val">${v}</div></div>`).join('');
}
function renderCollabGrid(cat) {
  const filtered = cat === 'all' ? collabCache : collabCache.filter(p => p.category === cat);
  const statusChip = { active: 'status-active', recruiting: 'status-recruiting', completed: 'status-completed' };
  document.getElementById('collabGrid').innerHTML = filtered.map(p => `
    <div class="collab-card cat-${p.category}" onclick="openCollabModal('${p.id}')">
      <div class="collab-cat ${p.category}">${{IT:'💻 IT',NGO:'🌍 NGO',Business:'💼 Business',University:'🎓 University'}[p.category]||p.category}</div>
      <div class="collab-name">${p.name}</div>
      <div class="collab-desc">${p.description}</div>
      <div class="collab-lead">
        <div class="lead-av">${p.leadPerson.avatar}</div>
        <div class="lead-info"><div class="lead-name">Led by ${p.leadPerson.name}</div><div class="lead-org">${p.leadPerson.org}</div></div>
      </div>
      <div class="collab-tags">${p.tags.map(t=>`<span class="collab-tag">#${t}</span>`).join('')}</div>
      <div class="collab-bottom" style="margin-top:12px">
        <div class="collab-members">👥 ${p.members} members</div>
        <span class="status-chip ${statusChip[p.status]||'status-active'}">${p.status}</span>
      </div>
      ${p.userJoined ? '<div style="margin-top:10px;font-size:11px;color:#34d399;font-weight:700">✓ You are a member</div>' : ''}
    </div>`).join('') || '<div class="empty-state">No projects in this category.</div>';
}

function openCollabModal(id) {
  const p = collabCache.find(x => x.id === id);
  if (!p) return;
  const statusChip = { active: 'status-active', recruiting: 'status-recruiting', completed: 'status-completed' };
  document.getElementById('collabModalContent').innerHTML = `
    <div class="modal-proj-hero">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.8px;margin-bottom:6px">${p.category} Project</div>
          <div class="modal-proj-title">${p.name}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <span class="status-chip ${statusChip[p.status]}">${p.status}</span>
            <span class="badge-pill">👥 ${p.members} members</span>
            <span class="badge-pill">💬 ${p.discussions} discussions</span>
          </div>
        </div>
        <button class="btn-primary ${p.userJoined?'':''}` + `" style="background:${p.userJoined?'rgba(16,185,129,.2)':'var(--surface2)'};border:${p.userJoined?'1px solid rgba(16,185,129,.3)':'none'};color:${p.userJoined?'#34d399':'#fff'}" onclick="toggleJoinProject('${p.id}',this)">${p.userJoined?'✓ Leave Project':'+ Join Project'}</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:16px">
        <div class="lead-av">${p.leadPerson.avatar}</div>
        <div><div style="font-size:13px;font-weight:700">Led by ${p.leadPerson.name}</div><div style="font-size:12px;color:var(--muted)">${p.leadPerson.org} · ${p.timeline.phase}</div></div>
      </div>
    </div>
    <div class="modal-tabs">
      <button class="modal-tab active" onclick="switchModalTab(this,'mt-about')">About</button>
      <button class="modal-tab" onclick="switchModalTab(this,'mt-tasks')">Tasks (${p.tasks.length})</button>
      <button class="modal-tab" onclick="switchModalTab(this,'mt-members')">Organizations</button>
      <button class="modal-tab" onclick="switchModalTab(this,'mt-files')">Files (${p.files.length})</button>
    </div>
    <div id="mt-about" class="modal-tab-content active">
      <p style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:16px">${p.description}</p>
      <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:10px">🎯 Goals</h4>
      ${p.goals.map(g=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px"><span style="color:#a5b4fc">→</span><span>${g}</span></div>`).join('')}
      <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin:16px 0 10px">📅 Timeline</h4>
      <div style="display:flex;gap:24px;font-size:13px"><div><div style="color:var(--muted);font-size:11px">Start</div><div style="font-weight:600">${p.timeline.start}</div></div><div><div style="color:var(--muted);font-size:11px">End</div><div style="font-weight:600">${p.timeline.end}</div></div><div><div style="color:var(--muted);font-size:11px">Phase</div><div style="font-weight:600">${p.timeline.phase}</div></div></div>
      <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">${p.tags.map(t=>`<span class="collab-tag">#${t}</span>`).join('')}</div>
    </div>
    <div id="mt-tasks" class="modal-tab-content">
      ${p.tasks.map(t=>`<div class="task-row"><div class="task-status task-${t.status.replace(' ','-')}"></div><div style="flex:1"><div style="font-size:13px;font-weight:600">${t.title}</div><div style="font-size:11px;color:var(--muted)">${t.assignee}</div></div><span class="badge-pill ${t.status==='done'?'badge-green':t.status==='in-progress'?'badge-amber':''}">${t.status}</span></div>`).join('')}
    </div>
    <div id="mt-members" class="modal-tab-content">
      <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:12px">🎓 Universities</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${p.universities.map(u=>`<span class="badge-pill">${u}</span>`).join('')}</div>
      <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:12px">🤝 Partner Organizations</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${p.orgs.map(o=>`<span class="badge-pill badge-green">${o}</span>`).join('')}</div>
    </div>
    <div id="mt-files" class="modal-tab-content">
      ${p.files.map(f=>`<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px;cursor:pointer" onclick="window.open('/assets/dummy.pdf', '_blank')"><div style="font-size:20px">${f.endsWith('.pdf')?'📄':f.endsWith('.md')?'📝':'🗂'}</div><div style="flex:1"><div style="font-size:13px;font-weight:600">${f}</div></div><span style="font-size:12px;color:#a5b4fc">Download</span></div>`).join('')}
    </div>`;
  openMod('collabModal');
}

function switchModalTab(btn, tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tab).classList.add('active');
}

async function toggleJoinProject(id, btn) {
  const res = await api('/api/collaboration/join', { method: 'POST', body: JSON.stringify({ projectId: id }) });
  if (res?.success) {
    const p = collabCache.find(x => x.id === id); if (p) { p.userJoined = res.joined; p.members = res.members; }
    btn.textContent = res.joined ? '✓ Leave Project' : '+ Join Project';
    btn.style.background = res.joined ? 'rgba(16,185,129,.2)' : 'var(--surface2)';
    btn.style.color = res.joined ? '#34d399' : '#fff';
    btn.style.border = res.joined ? '1px solid rgba(16,185,129,.3)' : 'none';
    showToast(res.joined ? 'Joined!' : 'Left', res.joined ? `You joined the project!` : `You left the project.`, res.joined ? 'success' : 'info');
    renderCollabGrid('all');
  }
}

// ── SOCIAL IMPACT ────────────────────────────────────────────
async function loadImpact() {
  const u = getUser();
  const data = await api('/api/student/impact');
  if (!data) return;
  // Personal impact card
  document.getElementById('impactPersonal').innerHTML = `
    <div style="flex:1">
      <h2 style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;margin-bottom:4px">🌱 Your Social Impact</h2>
      <p style="color:var(--muted);font-size:13px;margin-bottom:16px">Contributing to UN Sustainable Development Goals through UniVerse partnerships</p>
      <div class="impact-metrics">
        ${[['🕐',data.myHours,'Volunteer Hours'],['🤝',u?.joinedOrgs?.length||0,'Active Orgs'],['🌍','1,005','People Helped'],['💰',`€${data.myDonations.toFixed(2)}`,'Donated']].map(([ic,v,l])=>`<div class="impact-metric"><div style="font-size:28px">${ic}</div><div class="impact-metric-val">${v}</div><div class="impact-metric-lbl">${l}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="padding:12px 18px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);text-align:center"><div style="font-size:22px">🥇</div><div style="font-size:11px;color:#34d399;font-weight:700;margin-top:3px">Community Champion</div></div>
      <div style="padding:12px 18px;border-radius:10px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.2);text-align:center"><div style="font-size:22px">🌿</div><div style="font-size:11px;color:#67e8f9;font-weight:700;margin-top:3px">Green Advocate</div></div>
    </div>`;
  // Campus Stats
  document.getElementById('sdgBar').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-around;background:var(--surface);padding:24px;border-radius:12px;border:1px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,0.1);">
       <div style="text-align:center;min-width:120px"><div style="font-size:24px;font-weight:800;color:var(--green)">${data.campusStats.carbonSavedKg.toLocaleString()}kg</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px">CO2 Saved</div></div>
       <div style="text-align:center;min-width:120px"><div style="font-size:24px;font-weight:800;color:var(--secondary)">${data.campusStats.paperSavedPages.toLocaleString()}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px">Pages Saved</div></div>
       <div style="text-align:center;min-width:120px"><div style="font-size:24px;font-weight:800;color:var(--amber)">€${data.campusStats.totalDonations.toLocaleString()}</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px">Total Donated</div></div>
       <div style="text-align:center;min-width:120px"><div style="font-size:24px;font-weight:800;color:var(--primary)">${data.campusStats.totalVolunteerHours.toLocaleString()}h</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px">Volunteer Hrs</div></div>
    </div>
  `;
  // Initiatives grid
  document.getElementById('orgsGrid').innerHTML = data.initiatives.map(o => `
    <div class="org-card" style="display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--green);margin-bottom:6px">${o.ngo}</div>
        <div style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;margin-bottom:6px">${o.title}</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.5;margin-bottom:12px;">Goal: ${o.goal}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Status: <span style="color:var(--amber)">${o.status}</span></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" style="flex:1;background:rgba(16,185,129,.1);color:var(--green);border:1px solid rgba(16,185,129,.2)" onclick="showToast('Volunteer','Request sent to ${o.ngo}','success')">🙋 Volunteer</button>
        <button class="btn-primary" style="flex:1" onclick="promptDonate('${o.id}', '${o.title}')">💰 Donate</button>
      </div>
    </div>`).join('');
}

function promptDonate(initiativeId, title) {
  document.getElementById('donateInitiativeId').value = initiativeId;
  document.getElementById('donateSubtitle').textContent = `Support ${title} with your donation.`;
  document.getElementById('donateAmount').value = '5.00';
  document.getElementById('donateModal').classList.add('active');
}

function confirmDonate() {
  const initiativeId = document.getElementById('donateInitiativeId').value;
  const amt = document.getElementById('donateAmount').value;
  if (!amt || isNaN(amt) || Number(amt) <= 0) return;
  document.getElementById('donateModal').classList.remove('active');
  api('/api/student/impact/donate', { method: 'POST', body: JSON.stringify({ initiativeId, amount: amt }) }).then(res => {
    if (res && res.success) {
      showToast('Thank You! 💖', `You donated €${amt}`, 'success');
      loadImpact();
    }
  });
}

function toggleJoinOrg(btn, id) {
  const u = getUser();
  const joined = u.joinedOrgs || [];
  if (joined.includes(id)) { u.joinedOrgs = joined.filter(x=>x!==id); btn.textContent='Join Org'; btn.classList.remove('joined'); showToast('Left', 'You left the organization.', 'info'); }
  else { u.joinedOrgs = [...joined,id]; btn.textContent='✓ Joined'; btn.classList.add('joined'); showToast('Joined!', 'You joined the organization!', 'success'); }
  localStorage.setItem('universe_user', JSON.stringify(u));
}

function openOrgModal(id) {
  const o = window._orgsData?.find(x => x.id === id);
  if (!o) return;
  document.getElementById('orgModalContent').innerHTML = `
    <div style="padding:20px;background:var(--surface2),rgba(6,182,212,.06));border-radius:12px;margin-bottom:20px">
      <div style="font-size:10px;color:var(--green);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${o.type.replace('-',' ')}</div>
      <div style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;margin-bottom:8px">${o.name}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><span class="badge-pill badge-green">📍 ${o.location}</span><span class="badge-pill">👥 ${o.members.toLocaleString()} Members</span><span class="badge-pill">🕐 ${o.volunteerHours.toLocaleString()}h Volunteered</span></div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
      <div>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:8px">About</h4>
        <p style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:16px">${o.description}</p>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:8px">Recent Activities</h4>
        ${['Community Kitchen Day — Sep 14','Digital Literacy Workshop — Sep 8','City Council Presentation — Sep 2'].map(a=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;color:var(--muted)"><span>📅</span><span>${a}</span></div>`).join('')}
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin:16px 0 8px">Upcoming Events</h4>
        ${['🎪 Open Day — Sep 28','📚 Volunteer Training — Oct 5','🌿 SDG Workshop — Oct 12'].map(e=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px">${e}</div>`).join('')}
      </div>
      <div>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:8px">Tags</h4>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px">${o.tags.map(t=>`<span style="font-size:11px;padding:3px 8px;border-radius:20px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:var(--green)">#${t}</span>`).join('')}</div>
        <h4 style="font-family:'Outfit',sans-serif;font-weight:700;margin-bottom:8px">Contact</h4>
        <div style="font-size:13px;color:var(--muted)">✉️ ${o.contact}</div>
        <div style="margin-top:16px"><button class="btn-primary" style="width:100%;background:var(--surface2)" onclick="showToast('Volunteer','Your volunteer application has been sent!','success')">🙋 Volunteer Now</button></div>
        <div style="margin-top:8px"><button class="btn-primary" style="width:100%;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc" onclick="showToast('Shared','Organization link copied!','info')">Share ↗</button></div>
      </div>
    </div>`;
  openMod('orgModal');
}

// ── PAYMENTS ─────────────────────────────────────────────────
let payCache = null;
let currentPayInvoice = null;
let cardFlipped = false;
let payMethod = 'card';

async function loadPayments() {
  const data = await api('/api/student/payments');
  if (!data) return;
  payCache = data;
  // Dashboard
  const s = data.summary;
  const allAmt = data.invoices.reduce((x,i)=>x+i.amount,0);
  document.getElementById('payDashboard').innerHTML = `
    <div class="kpi" style="--kpi-grad:var(--surface2)"><div class="kpi-icon">⏳</div><div class="kpi-lbl">Pending</div><div class="kpi-val">€${s.totalPending.toLocaleString()}</div><div class="kpi-meta">Pay to avoid penalty</div></div>
    <div class="kpi" style="--kpi-grad:var(--surface2)"><div class="kpi-icon">✅</div><div class="kpi-lbl">Paid</div><div class="kpi-val">€${s.totalPaid.toLocaleString()}</div><div class="kpi-meta">This academic year</div></div>
    <div class="kpi" style="--kpi-grad:var(--surface2)"><div class="kpi-icon">📄</div><div class="kpi-lbl">Invoices</div><div class="kpi-val">${data.invoices.length}</div><div class="kpi-meta">${data.invoices.filter(i=>i.status==='pending').length} pending</div></div>
    <div class="card pay-chart-card"><div style="font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;margin-bottom:10px">Fee Breakdown</div><div style="height:140px"><canvas id="payPieChart"></canvas></div></div>`;
  setTimeout(() => {
    const ctx = document.getElementById('payPieChart')?.getContext('2d');
    if (!ctx) return;
    const cats = {}; data.invoices.forEach(i => cats[i.category]=(cats[i.category]||0)+i.amount);
    new Chart(ctx, { type:'doughnut', data:{ labels:Object.keys(cats), datasets:[{ data:Object.values(cats), backgroundColor:['rgba(99,102,241,.8)','rgba(6,182,212,.8)','rgba(245,158,11,.8)','rgba(16,185,129,.8)'], borderColor:'rgba(6,10,20,.8)', borderWidth:3 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'right', labels:{ color:'#8896b3', font:{family:'Inter',size:10}, boxWidth:10, padding:8 } } } } });
  }, 100);
  // Pending invoices
  document.getElementById('pendingInvoices').innerHTML = data.invoices.filter(i=>i.status==='pending').map(inv => `
    <div class="invoice-detail-card" id="inv-${inv.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);letter-spacing:.6px">${inv.category}</div>
          <div class="invoice-title">${inv.title}</div>
          <div style="font-size:12px;color:var(--amber);margin-top:4px">⚠️ Due: ${new Date(inv.dueDate).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:900">€${inv.amount.toLocaleString()}</div>
          <button class="btn-primary" style="margin-top:8px;font-size:12px;padding:8px 16px" onclick="openPayModal('${inv.id}')">Pay Now →</button>
        </div>
      </div>
      <div class="invoice-breakdown">
        ${inv.breakdown.map(b=>`<div class="breakdown-row"><span>${b.item}</span><span>€${b.amount.toLocaleString()}</span></div>`).join('')}
        <div class="breakdown-total"><span>Total</span><span>€${inv.amount.toLocaleString()}</span></div>
      </div>
    </div>`).join('') || '<div class="empty-state" style="color:var(--green)">🎉 All fees paid! Great job.</div>';
  // History
  document.getElementById('payHistory').innerHTML = data.invoices.filter(i=>i.status==='paid').length ? data.invoices.filter(i=>i.status==='paid').map(inv => {
    const txn = data.transactions.find(t=>t.invoiceId===inv.id);
    return `<div class="invoice-detail-card"><div style="display:flex;justify-content:space-between;align-items:center">
      <div><div class="invoice-title" style="font-size:14px">${inv.title}</div><div style="font-size:12px;color:var(--muted);margin-top:3px">📅 ${inv.paidDate} · ${txn?.brand||'Card'} ····${txn?.last4||'****'}</div><div style="font-size:11px;color:#34d399;margin-top:2px">Receipt: ${inv.receiptId}</div></div>
      <div style="text-align:right"><div style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;color:#34d399">€${inv.amount.toLocaleString()}</div><span class="badge-pill badge-green">Paid</span><br/><button class="btn-text" style="margin-top:4px;font-size:11px" onclick="showReceiptModal('${inv.id}')">View Receipt</button></div>
    </div></div>`;
  }).join('') : '<div class="empty-state">No payment history yet.</div>';
}

function openPayModal(invoiceId) {
  const inv = payCache?.invoices.find(i=>i.id===invoiceId);
  if (!inv) return;
  currentPayInvoice = inv;
  cardFlipped = false; payMethod = 'card';
  document.getElementById('payModalContent').innerHTML = `
    <h2 style="font-family:'Outfit',sans-serif;font-size:20px;font-weight:800;margin-bottom:4px">Secure Payment</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px">${inv.title}</p>
    <div class="pay-method-tabs">
      <button class="pay-method-btn active" id="methodCard" onclick="switchPayMethod('card')">💳 Credit / Debit Card</button>
      <button class="pay-method-btn" id="methodBank" onclick="switchPayMethod('bank')">🏦 Bank Transfer</button>
    </div>
    <div id="cardPaySection">
      <div class="credit-card-wrap">
        <div class="credit-card" id="creditCard" onclick="flipCard()">
          <div class="card-front">
            <div class="card-chip">▬▬</div>
            <div id="cardBrandDisplay" class="card-brand">💳</div>
            <div class="card-number" id="cardNumDisplay">•••• •••• •••• ••••</div>
            <div class="card-bottom"><div><div class="card-field-lbl">Card Holder</div><div id="cardNameDisplay">YOUR NAME</div></div><div><div class="card-field-lbl">Expires</div><div id="cardExpDisplay">MM/YY</div></div></div>
          </div>
          <div class="card-back">
            <div class="card-back-stripe"></div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:8px;text-align:right">CVV</div>
            <div class="card-back-cvv" id="cvvDisplay">•••</div>
            <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:12px;text-align:center">Click card to flip back</div>
          </div>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Card Number</label><input class="form-input" id="payCardNum" maxlength="19" placeholder="1234 5678 9012 3456" oninput="fmtCard(this)" onfocus="flipCard(false)"/></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group"><label class="form-label">Expiry</label><input class="form-input" id="payCardExp" maxlength="5" placeholder="MM/YY" oninput="fmtExp(this)" onfocus="flipCard(false)"/></div>
        <div class="form-group"><label class="form-label">CVV</label><input class="form-input" id="payCardCvv" maxlength="3" placeholder="•••" onfocus="flipCard(true)" onblur="flipCard(false)" oninput="document.getElementById('cvvDisplay').textContent=this.value||'•••'"/></div>
      </div>
      <div class="form-group"><label class="form-label">Name on Card</label><input class="form-input" id="payCardName" placeholder="Full name as on card" oninput="document.getElementById('cardNameDisplay').textContent=this.value||'YOUR NAME'"/></div>
    </div>
    <div id="bankPaySection" style="display:none">
      <div style="background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.15);border-radius:12px;padding:20px;margin-bottom:16px">
        ${[['IBAN','FR76 1234 5678 9012 3456 789 01'],['BIC/SWIFT','BNPAFRPP'],['Bank','BNP Paribas · UniVerse Finance'],['Reference',`PAY-${inv.id.toUpperCase()}`],['Amount',`€${inv.amount.toLocaleString()}`]].map(([l,v])=>`<div class="breakdown-row"><span>${l}</span><strong>${v}</strong></div>`).join('')}
      </div>
      <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:12px;font-size:12px;color:var(--amber)">⚠️ Bank transfers may take 2-3 business days to process. Use the reference code above.</div>
    </div>
    <div class="pay-amount-big">€${inv.amount.toLocaleString()}</div>
    <button class="btn-pay-final" id="payFinalBtn" onclick="processPayment()">🔒 Pay €${inv.amount.toLocaleString()} Securely</button>
    <p style="text-align:center;color:#4a5578;font-size:11px;margin-top:10px">🔒 256-bit SSL · PCI DSS Compliant · Your card is never stored</p>`;
  openMod('payModal');
}

function switchPayMethod(method) {
  payMethod = method;
  document.getElementById('methodCard').classList.toggle('active', method==='card');
  document.getElementById('methodBank').classList.toggle('active', method==='bank');
  document.getElementById('cardPaySection').style.display = method==='card'?'block':'none';
  document.getElementById('bankPaySection').style.display = method==='bank'?'block':'none';
  const btn = document.getElementById('payFinalBtn');
  btn.textContent = method==='card'?`🔒 Pay €${currentPayInvoice.amount.toLocaleString()} Securely`:`✓ I've Made the Transfer`;
}

function flipCard(force) {
  const card = document.getElementById('creditCard');
  if (!card) return;
  cardFlipped = force !== undefined ? force : !cardFlipped;
  card.classList.toggle('flipped', cardFlipped);
}

function fmtCard(el) {
  let v = el.value.replace(/\D/g,'').substring(0,16);
  el.value = v.replace(/(.{4})/g,'$1 ').trim();
  document.getElementById('cardNumDisplay').textContent = el.value || '•••• •••• •••• ••••';
  const brands = { '4':'💳 Visa', '5':'💳 MC', '3':'💳 Amex', '6':'💳 Discover' };
  document.getElementById('cardBrandDisplay').textContent = brands[v[0]] || '💳';
}
function fmtExp(el) {
  let v = el.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.substring(0,2)+'/'+v.substring(2,4);
  el.value = v;
  document.getElementById('cardExpDisplay').textContent = el.value || 'MM/YY';
}

async function processPayment() {
  const btn = document.getElementById('payFinalBtn');
  if (payMethod === 'bank') {
    showToast('Transfer Noted', 'Please complete the bank transfer using the reference code provided.', 'info');
    closeMod('payModal'); return;
  }
  const num = document.getElementById('payCardNum')?.value.replace(/\s/g,'');
  const exp = document.getElementById('payCardExp')?.value;
  const cvv = document.getElementById('payCardCvv')?.value;
  const name = document.getElementById('payCardName')?.value;
  if (!num||num.length<16||!exp||!cvv||!name) { showToast('Incomplete', 'Please fill in all card details.', 'warning'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> Processing...';
  await new Promise(r => setTimeout(r, 2200));
  const brand = { '4':'Visa','5':'Mastercard','3':'Amex','6':'Discover' }[num[0]] || 'Card';
  const res = await api('/api/student/payments/pay', { method: 'POST', body: JSON.stringify({ invoiceId: currentPayInvoice.id, method: 'card', last4: num.slice(-4), brand }) });
  if (res?.success) {
    btn.innerHTML = '✅ Payment Successful!';
    btn.style.background = 'var(--surface2)';
    showToast('Payment Successful!', `€${currentPayInvoice.amount.toLocaleString()} paid. Receipt: ${res.receiptId}`, 'success');
    setTimeout(() => { closeMod('payModal'); loadPayments(); loadNotifications(); showReceiptFromData(res); }, 1500);
  } else { btn.disabled=false; btn.innerHTML=`🔒 Pay €${currentPayInvoice.amount.toLocaleString()} Securely`; showToast('Payment Failed', res?.error||'Please try again.', 'error'); }
}

function showReceiptFromData(res) {
  document.getElementById('receiptContent').innerHTML = `
    <div style="text-align:center;margin-bottom:24px"><div style="font-size:56px">🧾</div><h2 style="font-family:'Outfit',sans-serif;margin-top:8px;font-size:22px;font-weight:800">Payment Receipt</h2></div>
    <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:14px;padding:20px;margin-bottom:20px">
      ${[['Receipt ID',res.receiptId],['Invoice',res.invoice.title],['Amount','€'+res.invoice.amount.toLocaleString()],['Date',res.invoice.paidDate],['Method',`${res.transaction.brand||'Card'} ···· ${res.transaction.last4}`],['Status','✅ Paid & Confirmed']].map(([l,v])=>`<div class="breakdown-row" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:var(--muted)">${l}</span><strong>${v}</strong></div>`).join('')}
    </div>
    <button class="btn-primary" style="width:100%;padding:13px;margin-bottom:8px" onclick="closeMod('receiptModal')">Done</button>
    <button class="btn-primary" style="width:100%;padding:11px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc" onclick="window.open('/assets/dummy.pdf', '_blank')">📥 Download PDF</button>`;
  openMod('receiptModal');
}

function showReceiptModal(invoiceId) {
  const inv = payCache?.invoices.find(i=>i.id===invoiceId);
  const txn = payCache?.transactions.find(t=>t.invoiceId===invoiceId);
  if (!inv) return;
  showReceiptFromData({ receiptId: inv.receiptId||'N/A', invoice: inv, transaction: txn||{ brand:'Card', last4:'****' } });
}

// ── STUDY MATERIALS ────────────────────────────────────────────
async function loadKnowledge() {
  const data = await api('/api/student/knowledge');
  if (!data) return;
  const icons = { 'PDF': '📄', 'DOCX': '📝', 'VIDEO': '🎥' };
  document.getElementById('knowledgeGrid').innerHTML = data.materials.map(m => `
    <div class="material-card" onclick="showToast('Opening', 'Opening ${m.title}...', 'info')" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;display:flex;align-items:center;gap:16px;transition:0.2s">
      <div style="font-size:32px">${icons[m.type]||'🗂'}</div>
      <div style="flex:1">
        <div style="font-size:11px;color:#a5b4fc;font-weight:700">${m.course}</div>
        <div style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;margin:4px 0">${m.title}</div>
        <div style="font-size:12px;color:var(--muted)">${new Date(m.date).toLocaleDateString()} · ${m.size}</div>
      </div>
      <div><button class="btn-primary" style="padding:8px 16px;font-size:12px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);color:#a5b4fc">Open ↗</button></div>
    </div>
  `).join('') || '<div class="empty-state">No materials found.</div>';
}

async function loadCareer() {
  const data = await api('/api/student/career');
  if (!data) return;
  document.getElementById('careerGrid').innerHTML = data.jobs.map(j => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700">${j.title}</div>
        <span class="badge-pill badge-green" style="font-size:10px">${j.type}</span>
      </div>
      <div style="font-size:14px;color:var(--muted);display:flex;align-items:center;gap:6px">🏢 ${j.company}</div>
      <div style="font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px">📍 ${j.location}</div>
      <div style="font-size:11px;color:#a5b4fc;margin-top:auto;padding-top:12px;border-top:1px dashed rgba(255,255,255,0.1)">Posted: ${j.posted}</div>
      <button class="btn-primary" onclick="showToast('Applied!', 'Application sent to ${j.company}', 'success')" style="width:100%;margin-top:8px">Apply Now</button>
    </div>
  `).join('');
}

async function loadAlumni() {
  const data = await api('/api/student/alumni');
  if (!data) return;
  document.getElementById('alumniGrid').innerHTML = data.alumni.map(a => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="width:64px;height:64px;border-radius:32px;background:var(--surface2);color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">${a.name.charAt(0)}</div>
      <div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700">${a.name}</div>
      <div style="font-size:12px;color:#a5b4fc;margin-bottom:8px">Class of ${a.gradYear}</div>
      <div style="font-size:14px;color:var(--muted)">${a.role} at ${a.company}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">📍 ${a.location}</div>
      <button class="btn-primary" onclick="showToast('Message Sent', 'Connecting request sent to ${a.name}', 'success')" style="width:100%;margin-top:16px;background:rgba(255,255,255,0.05)">Connect</button>
    </div>
  `).join('');
}

async function loadDocuments() {
  const data = await api('/api/student/documents');
  if (!data) return;
  if(data.cvec) document.getElementById('cvecInput').value = data.cvec;
  document.getElementById('docsGrid').innerHTML = data.docs.map(d => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:24px">📄</div>
      <div style="font-family:'Outfit',sans-serif;font-size:15px;font-weight:600">${d.title}</div>
      <div style="font-size:11px;color:var(--muted)">Issued: ${d.date}</div>
      <button class="btn-primary" onclick="window.open('/assets/dummy.pdf', '_blank')" style="width:100%;margin-top:auto">Download</button>
    </div>
  `).join('');
}

async function saveCVEC() {
  const cvec = document.getElementById('cvecInput').value;
  if(!cvec) return showToast('Error', 'Please enter a CVEC number', 'error');
  const res = await api('/api/student/documents/cvec', { method: 'POST', body: JSON.stringify({ cvec }) });
  if(res && res.success) showToast('Saved', 'CVEC number saved securely', 'success');
}

let inboxData = { messages: [], reports: [] };
async function loadInbox() {
  const data = await api('/api/student/inbox');
  const annData = await api('/api/announcements');
  
  if (!data) return;
  
  // Filter announcements for this student (All Students or matching course/dept)
  const myAnns = (annData?.announcements || []).filter(a => {
    if (a.target === 'All Students') return true;
    if (dashboardData && dashboardData.user && dashboardData.user.department === a.target) return true;
    if (dashboardData && dashboardData.courses && dashboardData.courses.some(c => c.id === a.target || c.name === a.target)) return true;
    return false;
  }).map(a => ({
    id: a.id,
    subject: `[Announcement] ${a.title}`,
    sender: a.sender,
    date: a.date.split('T')[0],
    body: a.msg,
    _isAnn: true
  }));

  inboxData = {
    messages: [...myAnns, ...(data.messages || [])],
    reports: data.reports || []
  };
  
  filterInbox('messages');
}

function filterInbox(type) {
  document.querySelectorAll('#inboxSidebar .filter-btn').forEach(b => b.classList.remove('active'));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  } else {
    // Select the button matching the type programmatically
    const btns = document.querySelectorAll('#inboxSidebar .filter-btn');
    if (type === 'messages' && btns[1]) btns[1].classList.add('active');
    else if (type === 'reports' && btns[2]) btns[2].classList.add('active');
  }
  const list = type === 'messages' ? inboxData.messages : inboxData.reports;
  document.getElementById('inboxList').innerHTML = list.map(item => `
    <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px;cursor:pointer;border:1px solid transparent;transition:0.2s" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'" onclick="viewMessage('${type}', '${item.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <div style="font-weight:600;font-size:13px;color:${item._isAnn?'#06b6d4':'inherit'}">${type === 'messages' ? (item._isAnn?'📢 ':'')+item.sender : item.subject}</div>
        <div style="font-size:11px;color:var(--muted)">${item.date}</div>
      </div>
      <div style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${type === 'messages' ? item.subject : item.status}</div>
    </div>
  `).join('') || '<div style="font-size:13px;color:var(--muted);text-align:center">No items</div>';
}

function viewMessage(type, id) {
  const item = (type === 'messages' ? inboxData.messages : inboxData.reports).find(x => x.id === id);
  if(!item) return;
  document.getElementById('inboxDetail').innerHTML = `
    <div style="padding:24px;border-bottom:1px solid rgba(255,255,255,0.05)">
      <h2 style="font-family:'Outfit',sans-serif">${item.subject}</h2>
      <div style="display:flex;justify-content:space-between;margin-top:8px;color:var(--muted);font-size:13px">
        <div>${type === 'messages' ? 'From: ' + item.sender : 'Status: ' + item.status}</div>
        <div>${item.date}</div>
      </div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:#e2e8f0;flex:1;overflow-y:auto">
      ${item.body || 'No description provided.'}
    </div>
  `;
}

function composeMessage() {
  document.getElementById('inboxDetail').innerHTML = `
    <div style="padding:24px;display:flex;flex-direction:column;height:100%;gap:16px">
      <h2 style="font-family:'Outfit',sans-serif">New Message / Report</h2>
      <input type="text" class="form-input" placeholder="To / Department" />
      <input type="text" class="form-input" placeholder="Subject" />
      <textarea class="form-input" placeholder="Message body..." style="flex:1;resize:none"></textarea>
      <div style="text-align:right">
        <button class="btn-primary" onclick="showToast('Sent!', 'Your message has been sent.', 'success');loadInbox()">Send Message</button>
      </div>
    </div>
  `;
}

// ── QUIZZES ──────────────────────────────────────────────────
let quizzesCache = [];
async function loadQuizzes() {
  const data = await api('/api/student/quizzes');
  if (!data) return;
  quizzesCache = data.quizzes;
  document.getElementById('quizzesGrid').innerHTML = data.quizzes.map(q => {
    const isPast = new Date() > new Date(q.dueDate);
    const completed = q.submissions && q.submissions.find(s => s.studentId === getUser()?.studentId);
    let statusHTML = '';
    if (completed) {
      statusHTML = `<span class="badge-pill badge-green">Completed · Score: ${completed.score}%</span>`;
    } else if (isPast) {
      statusHTML = `<span class="badge-pill badge-amber" style="background:rgba(244,63,94,.1);color:var(--rose)">Overdue</span>`;
    } else {
      statusHTML = `<span class="badge-pill badge-amber">Due: ${new Date(q.dueDate).toLocaleDateString()}</span>`;
    }
    return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;color:#a5b4fc;font-weight:700;margin-bottom:4px">${q.courseId}</div>
        <div style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px">${q.title}</div>
        ${statusHTML}
      </div>
      <div>
        <button class="btn-primary" ${completed||isPast?'disabled':''} style="${completed||isPast?'opacity:0.5;cursor:not-allowed':''}" onclick="openQuiz('${q.id}')">${completed?'View Results':'Start Quiz →'}</button>
      </div>
    </div>
    `;
  }).join('') || '<div class="empty-state">No quizzes available.</div>';
}

function openQuiz(id) {
  const q = quizzesCache.find(x => x.id === id);
  if (!q) return;
  document.getElementById('quizModalContent').innerHTML = `
    <div style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:20px">
      <div style="font-size:12px;color:#a5b4fc;font-weight:700">${q.courseId}</div>
      <h2 style="font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;margin-top:4px">${q.title}</h2>
    </div>
    <div id="quizForm">
      ${q.questions.map((ques, i) => `
        <div style="margin-bottom:24px;background:rgba(255,255,255,.02);padding:16px;border-radius:10px;border:1px solid var(--border)">
          <div style="font-weight:600;margin-bottom:12px">${i+1}. ${ques.question}</div>
          ${ques.options.map(opt => `
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;font-size:14px;color:var(--muted)">
              <input type="radio" name="q_${i}" value="${opt}" style="accent-color:#6366f1;width:16px;height:16px"/>
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      `).join('')}
      <button class="btn-primary" style="width:100%;padding:14px;font-size:16px;margin-top:8px" onclick="submitQuiz('${q.id}')">Submit Answers 📤</button>
    </div>
  `;
  openMod('quizModal');
}

async function submitQuiz(id) {
  const q = quizzesCache.find(x => x.id === id);
  if (!q) return;
  const answers = [];
  for (let i = 0; i < q.questions.length; i++) {
    const selected = document.querySelector(`input[name="q_${i}"]:checked`);
    if (!selected) {
      showToast('Incomplete', 'Please answer all questions.', 'warning');
      return;
    }
    answers.push(selected.value);
  }
  const res = await api('/api/student/quizzes/submit', { method: 'POST', body: JSON.stringify({ quizId: id, answers }) });
  if (res?.success) {
    showToast('Quiz Submitted', `You scored ${res.score}%!`, 'success');
    closeMod('quizModal');
    loadQuizzes();
  } else {
    showToast('Error', res?.error || 'Failed to submit quiz.', 'error');
  }
}

// ── CHATBOT ──────────────────────────────────────────────────
let chatHistory = [];
function toggleChat() { document.getElementById('chatWindow').classList.toggle('open'); }
function quickAsk(msg) { document.getElementById('chatInput').value = msg; sendChat(); }
async function sendChat() {
  const input = document.getElementById('chatInput'); const msg = input.value.trim(); if (!msg) return;
  input.value = '';
  const msgs = document.getElementById('chatMessages');
  msgs.innerHTML += `<div class="chat-msg user">${msg}</div>`;
  msgs.innerHTML += `<div class="chat-msg loading" id="chatLoading">⋯</div>`;
  msgs.scrollTop = msgs.scrollHeight;
  const u = getUser();
  const context = { role:'student', name:u?.name, gpa:u?.gpa, attendance:80, pendingFees:payCache?.summary?.totalPending||6350, assignments:7 };
  chatHistory.push({ role:'user', content:msg });
  try {
    const res = await api('/api/chatbot', { method:'POST', body: JSON.stringify({ message:msg, history:chatHistory.slice(-8), context }) });
    document.getElementById('chatLoading')?.remove();
    if (res?.reply) { msgs.innerHTML+=`<div class="chat-msg bot">${res.reply}</div>`; chatHistory.push({role:'model',content:res.reply}); }
  } catch { document.getElementById('chatLoading')?.remove(); msgs.innerHTML+=`<div class="chat-msg bot">Sorry, connection error. Try again.</div>`; }
  msgs.scrollTop = msgs.scrollHeight;
}

// ── UTILS ──────────────────────────────────────────────────
function timeAgo(ts) { const s=Math.floor((Date.now()-new Date(ts))/1000); if(s<60)return'just now'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
// ── UPLOAD DOCUMENT ─────────────────────────────────────────────
async function uploadDocument() {
  const fileInput = document.getElementById('docUpload');
  if (!fileInput.files.length) {
    showToast("Error", "Please select a file to upload first!", "error");
    return;
  }
  const file = fileInput.files[0];
  showToast("Success", `Document "${file.name}" uploaded successfully for verification!`, "success");
  
  const docsGrid = document.getElementById('docsGrid');
  const d = { title: file.name, date: new Date().toISOString().split('T')[0] };
  const newCard = document.createElement('div');
  newCard.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;opacity:0.8">
      <div style="font-size:24px">📄</div>
      <div style="font-family:'Outfit',sans-serif;font-size:15px;font-weight:600">${d.title} (Pending)</div>
      <div style="font-size:11px;color:var(--amber)">Uploaded: ${d.date}</div>
      <button class="btn-primary" disabled style="width:100%;margin-top:auto;opacity:0.5;background:var(--surface2)">Pending Verification</button>
    </div>
  `;
  docsGrid.appendChild(newCard.firstElementChild);
  
  fileInput.value = ''; // clear input
}
