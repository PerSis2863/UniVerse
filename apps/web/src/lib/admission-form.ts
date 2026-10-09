// Admission forms (Stage 5 · B15.1): the fields an admin adds to a round's application form, and the
// checks both the public form (in the browser) and the server (src/server/admissions.ts) run on the
// answers. Every form also asks for the student's name and date of birth and a contact (name,
// email, phone, relation); those are built in, not fields.

export const FIELD_TYPES = ['text', 'long', 'number', 'date', 'choice', 'multi', 'yesno', 'file'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export interface FormField { id: string; type: FieldType; label: string; help?: string; required: boolean; options?: string[] }
export type Answers = Record<string, string | string[]>;

export const FIELD_LABEL: Record<FieldType, string> = {
  text: 'Short answer', long: 'Long answer', number: 'Number', date: 'Date', choice: 'One choice', multi: 'Several choices', yesno: 'Yes or no', file: 'Document upload',
};
export const MAX_FIELDS = 30, MAX_FILES = 5, MAX_FILE_BYTES = 4 * 1024 * 1024;
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Where an application is (in order of how it usually goes). */
export const STAGES = ['RECEIVED', 'REVIEW', 'INTERVIEW', 'WAITLIST', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'DECLINED', 'REJECTED', 'WITHDRAWN'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  RECEIVED: 'Received', REVIEW: 'In review', INTERVIEW: 'Interview', WAITLIST: 'Waiting list', OFFERED: 'Offer made',
  ACCEPTED: 'Offer accepted', ENROLLED: 'Enrolled', DECLINED: 'Offer declined', REJECTED: 'Not offered a place', WITHDRAWN: 'Withdrawn',
};
/** What the family reads about each stage on their private page. */
export const STAGE_FOR_FAMILY: Record<Stage, string> = {
  RECEIVED: 'We have your application and will look at it soon.',
  REVIEW: 'Your application is being reviewed.',
  INTERVIEW: 'We’d like to meet you. The school will tell you when.',
  WAITLIST: 'You’re on the waiting list. We’ll update this page if a place opens.',
  OFFERED: 'We’re pleased to offer a place. Please read the offer and answer below.',
  ACCEPTED: 'You accepted the offer. The school will finish enrolment.',
  ENROLLED: 'Enrolled. The student can now sign up with the email the school has, and their classes will be waiting.',
  DECLINED: 'You declined the offer.',
  REJECTED: 'We’re sorry: we can’t offer a place this time.',
  WITHDRAWN: 'This application was withdrawn.',
};
/** Stages the school moves an application to by hand (offers, answers and enrolment have their own steps). */
export const MOVABLE: Stage[] = ['RECEIVED', 'REVIEW', 'INTERVIEW', 'WAITLIST', 'REJECTED'];

/** Cleans a form definition from an admin (drops what isn't valid; throws on a field without a label). */
export function cleanFields(v: unknown): FormField[] {
  if (!Array.isArray(v)) return [];
  if (v.length > MAX_FIELDS) throw new Error(`Up to ${MAX_FIELDS} questions.`);
  const seen = new Set<string>();
  const out = v.map((x, i) => {
    const f = (x ?? {}) as Record<string, unknown>;
    const type = FIELD_TYPES.find((t) => t === f.type) ?? 'text';
    const label = typeof f.label === 'string' ? f.label.trim().slice(0, 200) : '';
    if (!label) throw new Error(`Question ${i + 1} needs a label.`);
    let id = typeof f.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(f.id) ? f.id : `q${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    const options = type === 'choice' || type === 'multi'
      ? [...new Set((Array.isArray(f.options) ? f.options : []).filter((o): o is string => typeof o === 'string').map((o) => o.trim().slice(0, 100)).filter(Boolean))].slice(0, 30)
      : undefined;
    if (options && options.length < 2) throw new Error(`“${label}” needs at least two choices.`);
    const help = typeof f.help === 'string' ? f.help.trim().slice(0, 300) || undefined : undefined;
    return { id, type, label, help, required: f.required === true, ...(options ? { options } : {}) };
  });
  if (out.filter((f) => f.type === 'file').length > MAX_FILES) throw new Error(`Up to ${MAX_FILES} document uploads.`);
  return out;
}

/** Problems with a family's answers, by field id (files are checked separately: `hasFile`). */
export function checkAnswers(fields: FormField[], answers: Answers, hasFile: (id: string) => boolean = () => false): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = answers[f.id];
    const text = typeof v === 'string' ? v.trim() : '';
    const list = Array.isArray(v) ? v : [];
    if (f.type === 'file') { if (f.required && !hasFile(f.id)) errors[f.id] = 'Please attach this document.'; continue; }
    const empty = f.type === 'multi' ? list.length === 0 : !text;
    if (empty) { if (f.required) errors[f.id] = 'Please answer this.'; continue; }
    if (f.type === 'text' && text.length > 300) errors[f.id] = 'Keep it under 300 characters.';
    if (f.type === 'long' && text.length > 5000) errors[f.id] = 'Keep it under 5,000 characters.';
    if (f.type === 'number' && !Number.isFinite(Number(text))) errors[f.id] = 'Enter a number.';
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) errors[f.id] = 'Enter a date.';
    if (f.type === 'choice' && !f.options?.includes(text)) errors[f.id] = 'Choose one of the options.';
    if (f.type === 'multi' && list.some((x) => !f.options?.includes(x))) errors[f.id] = 'Choose from the options.';
    if (f.type === 'yesno' && text !== 'yes' && text !== 'no') errors[f.id] = 'Choose yes or no.';
  }
  return errors;
}

/** The offer letter from a round's template: {student}, {contact}, {round}, {school}, {date}. */
export function fillLetter(template: string, v: { student: string; contact: string; round: string; school: string; date: string }) {
  return template.replace(/\{(student|contact|round|school|date)\}/g, (_, k: keyof typeof v) => v[k]);
}

export const DEFAULT_OFFER = `Dear {contact},

We are delighted to offer {student} a place at {school} ({round}).

Please accept or decline this offer on your application page. If you accept, we will complete the enrolment and send the details of the first day.

With warm wishes,
{school}
{date}`;
