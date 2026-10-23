// A CV from the skills passport (Stage 5 · Q14): the page as HTML in one of three looks, which the
// browser turns into a PDF (src/components/docs/doc-to-pdf.ts; nothing is drawn on the server).
// Plain words and real text throughout, so the systems employers use to read CVs can read it.

export type CvTemplate = 'classic' | 'modern' | 'compact';
export const CV_TEMPLATES: { value: CvTemplate; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern', label: 'Modern' },
  { value: 'compact', label: 'Compact' },
];

export interface CvInput {
  template: CvTemplate;
  accent: string;
  name: string;
  headline?: string | null;
  contact?: string | null;
  summary?: string | null;
  portfolioUrl?: string | null;
  evidence?: { label: string; count: number; best: string | null }[];
  credentials?: { title: string; projectName: string; organization: string; hoursCompleted: number; issuedAt: string; verifyUrl: string; certificateCode: string }[];
  skills?: { name: string; level: string }[];
  courses?: { code: string; name: string; credits: number }[];
  impact?: { hours: number; people: number; credentials: number } | null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const month = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
const level = (l: string) => l.charAt(0) + l.slice(1).toLowerCase();
const safeColour = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#253745');

/** The CV's sections, in order, as HTML (each left out when it has nothing). */
function sections(c: CvInput) {
  const out: { id: string; title: string; html: string }[] = [];
  if (c.summary?.trim()) out.push({ id: 'summary', title: 'Profile', html: `<p>${esc(c.summary.trim())}</p>` });
  if (c.evidence?.length) out.push({ id: 'evidence', title: 'Skills shown in checked work', html: `<ul>${c.evidence.map((e) => `<li><b>${esc(e.label)}</b>: ${e.count} piece${e.count === 1 ? '' : 's'} of evidence${e.best ? ` (best: ${esc(e.best)})` : ''}</li>`).join('')}</ul>` });
  if (c.credentials?.length) out.push({ id: 'credentials', title: 'Verified experience', html: c.credentials.map((x) => `<div class="cv-item"><p class="cv-row"><b>${esc(x.title)}</b><span>${esc(month(x.issuedAt))}</span></p><p>${esc(x.projectName)} · ${esc(x.organization)} · ${x.hoursCompleted} verified hours</p><p class="cv-small">Verify: ${esc(x.verifyUrl)} (code ${esc(x.certificateCode)})</p></div>`).join('') });
  if (c.impact && (c.impact.hours || c.impact.credentials)) out.push({ id: 'impact', title: 'Impact', html: `<p>${c.impact.hours} verified volunteer hours · ${c.impact.people} people reached · ${c.impact.credentials} verified credential${c.impact.credentials === 1 ? '' : 's'}</p>` });
  if (c.skills?.length) out.push({ id: 'skills', title: 'Skills', html: `<p>${c.skills.map((s) => `${esc(s.name)} (${esc(level(s.level))})`).join(' · ')}</p>` });
  if (c.courses?.length) out.push({ id: 'courses', title: 'Courses', html: `<ul>${c.courses.map((k) => `<li>${esc(k.code)} ${esc(k.name)} (${k.credits} credits)</li>`).join('')}</ul>` });
  return out;
}

export function cvHtml(c: CvInput): string {
  const accent = safeColour(c.accent);
  const head = [c.headline, c.contact, c.portfolioUrl].filter((x): x is string => !!x?.trim()).map(esc);
  const parts = sections(c);
  const block = (s: (typeof parts)[number]) => `<section class="cv-sec cv-${s.id}"><h2>${esc(s.title)}</h2>${s.html}</section>`;
  const css = `
.cv{font:10.5pt/1.45 Arial,Helvetica,sans-serif;color:#11212d}.cv p{margin:0 0 4pt}.cv ul{margin:0 0 4pt;padding-left:14pt}.cv li{margin:0 0 2pt}
.cv h1{margin:0;font-size:22pt;line-height:1.15}.cv h2{margin:12pt 0 5pt;font-size:11pt;text-transform:uppercase;letter-spacing:.06em;color:${accent}}
.cv .cv-head p{margin:2pt 0 0;color:#33434f}.cv .cv-item{margin:0 0 7pt}.cv .cv-row{display:flex;justify-content:space-between;gap:8pt}.cv .cv-row span{color:#4a5c6a;white-space:nowrap}
.cv .cv-small{font-size:8.5pt;color:#4a5c6a;word-break:break-all}
.cv-classic .cv-head{text-align:center;border-bottom:1.5pt solid #11212d;padding-bottom:8pt}.cv-classic h1{font-family:Georgia,'Times New Roman',serif}.cv-classic h2{color:#11212d;border-bottom:.75pt solid #ccd0cf;padding-bottom:2pt}
.cv-modern .cv-head{border-left:6pt solid ${accent};padding:2pt 0 2pt 10pt;margin-bottom:6pt}.cv-modern h1{color:${accent}}
.cv-compact{font-size:9.5pt}.cv-compact .cv-grid{display:grid;grid-template-columns:34% 1fr;gap:14pt}.cv-compact .cv-side{background:#f2ece6;padding:8pt;border-radius:4pt}.cv-compact h1{font-size:19pt}.cv-compact .cv-head{margin-bottom:8pt}`;
  const header = `<header class="cv-head"><h1>${esc(c.name)}</h1>${head.map((h) => `<p>${h}</p>`).join('')}</header>`;
  if (c.template === 'compact') {
    const side = parts.filter((s) => s.id === 'skills' || s.id === 'impact' || s.id === 'courses');
    const main = parts.filter((s) => !side.includes(s));
    return `<style>${css}</style><div class="cv cv-compact">${header}<div class="cv-grid"><div class="cv-side">${side.map(block).join('')}</div><div>${main.map(block).join('')}</div></div></div>`;
  }
  return `<style>${css}</style><div class="cv cv-${c.template === 'modern' ? 'modern' : 'classic'}">${header}${parts.map(block).join('')}</div>`;
}
