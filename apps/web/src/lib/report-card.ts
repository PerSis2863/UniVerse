// Report cards (Stage 5 · B15.3): what one student's card says for a term, and the printable page.
// Import-free apart from the gradebook maths, so the server builds cards and the browser prints them.

import { finalGrade, letter, type Category } from './gradebook';

export interface AttendanceCounts { present: number; late: number; absent: number; excused: number }
export interface CourseLine { code: string; name: string; teacher: string | null; final: number | null; letter: string | null; graded: number; attendance: AttendanceCounts; attendanceRate: number | null }
export interface ReportCardData {
  student: { name: string; email: string };
  term: { title: string; from: string; to: string };
  school: string;
  courses: CourseLine[];
  overall: { average: number | null; gpa: number | null; attendanceRate: number | null };
}

/** Present or late out of the classes that counted (excused ones don't), in percent. */
export function attendanceRate(a: AttendanceCounts): number | null {
  const counted = a.present + a.late + a.absent;
  return counted ? Math.round(((a.present + a.late) / counted) * 100) : null;
}

/** One course's line: the weighted final from its gradebook categories, and attendance. */
export function courseLine(c: { code: string; name: string; teacher: string | null }, grades: { assessment: string; score: number; maxScore: number }[], categories: Category[], categoryOf: (assessment: string) => string | null, attendance: AttendanceCounts): CourseLine {
  const f = finalGrade(grades, categories, categoryOf).final;
  const final = f == null ? null : Math.round(f);
  return { ...c, final, letter: letter(final)?.letter ?? null, graded: grades.length, attendance, attendanceRate: attendanceRate(attendance) };
}

/** The whole card's average (of course finals), GPA (4.0 scale) and attendance. */
export function overall(courses: CourseLine[]): ReportCardData['overall'] {
  const finals = courses.map((c) => c.final).filter((x): x is number => x != null);
  const sum: AttendanceCounts = courses.reduce((s, c) => ({ present: s.present + c.attendance.present, late: s.late + c.attendance.late, absent: s.absent + c.attendance.absent, excused: s.excused + c.attendance.excused }), { present: 0, late: 0, absent: 0, excused: 0 });
  const average = finals.length ? Math.round(finals.reduce((a, b) => a + b, 0) / finals.length) : null;
  const gpa = finals.length ? Math.round((finals.reduce((a, f) => a + (letter(f)?.gpa ?? 0), 0) / finals.length) * 100) / 100 : null;
  return { average, gpa, attendanceRate: attendanceRate(sum) };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** One card as printable HTML (no outer page), to put several on one sheet per student. */
export function reportCardSection(d: ReportCardData, comment: string | null): string {
  const rows = d.courses.map((c) => `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}${c.teacher ? `<br><small>${esc(c.teacher)}</small>` : ''}</td><td class="n">${c.final == null ? '—' : `${c.final}%`}</td><td class="n">${esc(c.letter ?? '—')}</td><td class="n">${c.attendanceRate == null ? '—' : `${c.attendanceRate}%`}</td></tr>`).join('');
  return `<section class="card"><header><p class="school">${esc(d.school)}</p><h1>Report card · ${esc(d.term.title)}</h1><p>${esc(d.student.name)}${d.student.email ? ` · ${esc(d.student.email)}` : ''}</p><p class="muted">${day(d.term.from)} – ${day(d.term.to)}</p></header>
<div class="sum"><div>Average<b>${d.overall.average == null ? '—' : `${d.overall.average}%`}</b></div><div>GPA (4.0)<b>${d.overall.gpa == null ? '—' : d.overall.gpa.toFixed(2)}</b></div><div>Attendance<b>${d.overall.attendanceRate == null ? '—' : `${d.overall.attendanceRate}%`}</b></div></div>
<table><thead><tr><th>Course</th><th class="n">Final</th><th class="n">Grade</th><th class="n">Attendance</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No courses this term.</td></tr>'}</tbody></table>
${comment ? `<div class="comment"><b>Comment</b><p>${esc(comment).replace(/\n/g, '<br>')}</p></div>` : ''}
<p class="muted note">Grades are each course’s weighted final for the term (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F below). Attendance counts present and late out of the classes held; excused absences don’t count.</p></section>`;
}

/** A full printable page with one or more cards (each on its own sheet); prints itself. */
export function reportCardsPage(title: string, cards: { data: ReportCardData; comment: string | null }[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font:14px/1.5 system-ui,-apple-system,sans-serif;color:#111;margin:0;background:#fff}
.card{padding:40px;page-break-after:always;max-width:780px;margin:0 auto}.card:last-child{page-break-after:auto}
h1{margin:4px 0;font-size:22px}p{margin:0}.school{font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:.08em;font-size:12px}.muted{color:#555}
.sum{display:flex;gap:40px;margin:24px 0}.sum b{display:block;font-size:22px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;vertical-align:top}th{background:#f4f4f6;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.n{text-align:right;white-space:nowrap}small{color:#555}
.comment{margin-top:24px;padding:12px 16px;border:1px solid #ddd;border-radius:8px}.note{margin-top:24px;font-size:11px}
@media print{.card{padding:24px}}
</style></head><body>${cards.map((c) => reportCardSection(c.data, c.comment)).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
}
