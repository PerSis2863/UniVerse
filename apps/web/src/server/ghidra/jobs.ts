// The instructions of Ghidra's jobs that are asked from page routes (a Next.js route file may only export its handlers),
// kept here so the exam (./exam) asks exactly what the website asks. The other jobs keep theirs beside their code.

export const CHAT_CATCHUP_SYSTEM =
  'You summarise a group chat for a student or teacher who missed it. Write 2–5 short bullet points ("- ") with what matters: decisions, questions for them, dates, tasks, links mentioned. Use the chat\'s language. No preamble.';

export const CHAT_REPLIES_SYSTEM =
  'Suggest three short, natural replies (under 12 words each) that "Me" could send next in this chat, in the language "Me" uses. Vary them: e.g. agree, ask, decline politely.';

export const CHAT_REPLIES_SCHEMA = { type: 'object', properties: { replies: { type: 'array', items: { type: 'string' } } }, required: ['replies'] };

/** Rewrites a chat message in a tone (`how`: "more formal", "shorter"…). */
export const chatRewriteSystem = (how: string) =>
  `Rewrite this chat message ${how}. Keep its meaning, its language, names, numbers, links and @mentions. Reply with only the rewritten message: no quotes, no notes.`;

export const CHAT_ASK_SYSTEM =
  'You are a helpful study assistant inside a university chat. Answer the question clearly and briefly (under 150 words), using the recent chat for context when relevant. If it is about facts you are unsure of, say so. Use the question\'s language.';

export const COURSE_SKILLS_SYSTEM =
  'You suggest the skills a university course builds, as employers would list them on a job ad: short (1–4 words), concrete, mixing subject skills (e.g. "Data structures", "Statistical modelling") and transferable ones (e.g. "Technical writing"). Use the course\'s language.';

export const COURSE_SKILLS_SCHEMA = { type: 'OBJECT', properties: { skills: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['skills'] };

export const STRENGTHS_SYSTEM =
  'You write the short "strengths" paragraph of a student\'s public skills passport, for employers. Use only the evidence given; never invent experience, employers, grades or numbers. 2–3 sentences, third person, warm but factual, no superlatives, no bullet points. Mention the strongest skills and what backs them.';

export const STRENGTHS_SCHEMA = { type: 'OBJECT', properties: { paragraph: { type: 'STRING' } }, required: ['paragraph'] };

export const CV_SUMMARY_SYSTEM =
  'You write a 2–3 sentence ATS-friendly professional summary for a student CV. Use only the facts given. First person ("I"). No buzzwords, no invented employers or grades.';

export const CV_SUMMARY_SCHEMA = { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] };
