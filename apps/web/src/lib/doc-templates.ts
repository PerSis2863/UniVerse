// Doc templates (Stage 5 · B9.1): a new doc can start from one of these. The editor puts the
// template into the doc the first time it opens empty (src/app/(dashboard)/docs/[id]/page.tsx).

export interface DocTemplate { id: string; name: string; hint: string; html: string }

const h = (level: 1 | 2, text: string) => `<h${level}>${text}</h${level}>`;
const p = (text: string) => `<p>${text}</p>`;
const ul = (...items: string[]) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`;
const tasks = (...items: string[]) => `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`).join('')}</ul>`;

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'lab-report', name: 'Lab report', hint: 'Aim, method, results, discussion',
    html: [h(1, 'Lab report: [experiment]'), p('<em>Name · Course · Date</em>'), h(2, 'Aim'), p('What the experiment sets out to find.'), h(2, 'Hypothesis'), p('What you expect, and why.'),
      h(2, 'Materials'), ul('Item one', 'Item two'), h(2, 'Method'), `<ol><li><p>First step</p></li><li><p>Second step</p></li></ol>`, h(2, 'Results'),
      `<table><tbody><tr><th><p>Trial</p></th><th><p>Measurement</p></th><th><p>Notes</p></th></tr><tr><td><p>1</p></td><td><p></p></td><td><p></p></td></tr><tr><td><p>2</p></td><td><p></p></td><td><p></p></td></tr></tbody></table>`,
      h(2, 'Discussion'), p('What the results show, sources of error, and what you would change.'), h(2, 'Conclusion'), p('One short paragraph.'), h(2, 'References'), ul('Source one')].join(''),
  },
  {
    id: 'essay', name: 'Essay', hint: 'Thesis, body paragraphs, conclusion',
    html: [h(1, '[Essay title]'), p('<em>Name · Course · Date</em>'), h(2, 'Introduction'), p('Hook, context, and your thesis in one sentence.'), h(2, 'First point'), p('Claim, evidence, explanation.'),
      h(2, 'Second point'), p('Claim, evidence, explanation.'), h(2, 'Third point'), p('Claim, evidence, explanation.'), h(2, 'Counter-argument'), p('The strongest objection, and your answer to it.'),
      h(2, 'Conclusion'), p('Restate the thesis in new words and say why it matters.'), h(2, 'Works cited'), ul('Source one')].join(''),
  },
  {
    id: 'meeting-notes', name: 'Meeting notes', hint: 'Agenda, decisions, action items',
    html: [h(1, 'Meeting: [topic]'), p('<em>Date · Who came</em>'), h(2, 'Agenda'), `<ol><li><p>First item</p></li><li><p>Second item</p></li></ol>`, h(2, 'Notes'), p(''), h(2, 'Decisions'), ul('Decision'),
      h(2, 'Action items'), tasks('Who: what, by when', 'Who: what, by when'), h(2, 'Next meeting'), p('Date and topics.')].join(''),
  },
  {
    id: 'project-brief', name: 'Project brief', hint: 'Goal, scope, timeline, roles',
    html: [h(1, 'Project brief: [name]'), h(2, 'Goal'), p('The problem and what success looks like.'), h(2, 'Scope'), ul('In: …', 'Out: …'), h(2, 'Team and roles'), ul('Name: role'),
      h(2, 'Timeline'), `<table><tbody><tr><th><p>Milestone</p></th><th><p>Due</p></th><th><p>Owner</p></th></tr><tr><td><p>Research</p></td><td><p></p></td><td><p></p></td></tr><tr><td><p>First draft</p></td><td><p></p></td><td><p></p></td></tr><tr><td><p>Final</p></td><td><p></p></td><td><p></p></td></tr></tbody></table>`,
      h(2, 'Risks'), ul('Risk, and what we will do about it'), h(2, 'Checklist'), tasks('Agree the scope', 'Share the plan with the teacher')].join(''),
  },
  {
    id: 'cv', name: 'CV', hint: 'Profile, education, experience, skills',
    html: [h(1, '[Your name]'), p('Email · Phone · City · LinkedIn'), h(2, 'Profile'), p('Two lines about who you are and what you are looking for.'), h(2, 'Education'), p('<strong>Degree</strong>, University · 2024–2028'),
      h(2, 'Experience'), p('<strong>Role</strong>, Organisation · Dates'), ul('What you did, with a number if you can'), h(2, 'Projects and volunteering'), ul('Project: what and the result'),
      h(2, 'Skills'), ul('Skill', 'Language: level'), h(2, 'Awards'), ul('Award, year')].join(''),
  },
  {
    id: 'study-notes', name: 'Study notes', hint: 'Key ideas, examples, questions',
    html: [h(1, '[Topic] notes'), p('<em>Course · Lecture or chapter</em>'), h(2, 'Key ideas'), ul('Idea'), h(2, 'Definitions'), ul('<strong>Term</strong>: meaning'), h(2, 'Examples'), p(''),
      h(2, 'Questions to ask'), ul('Question'), h(2, 'Summary'), p('Three sentences in your own words.'), h(2, 'To review'), tasks('Re-read the slides', 'Try the practice questions')].join(''),
  },
];

export const templateById = (id: string | null | undefined) => DOC_TEMPLATES.find((t) => t.id === id) ?? null;
