import type { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { isAppFileUrl, readAppFile } from '@/lib/storage';
import { spendAi } from './ai-budget';
import { submissionForTeacher } from './assignments';
import { geminiAudioText } from './gemini';
import { BadRequestException, HttpException } from './http';

// Upgrade 8, feedback studio.
// • Voice or video feedback: the teacher records it in the browser and uploads it like a chat
//   voice note; the student plays it with their grade. An optional transcript costs one AI request.
// • Writing-style signals (no AI): an answer's sentence length, vocabulary and punctuation compared
//   with the same student's own earlier answers. A hint for a conversation, never a verdict.

// ─── Writing-style signals ───────────────────────────────────────────────────────────────────

interface Profile { words: number; sentence: number; wordLength: number; vocabulary: number; commas: number; semicolons: number; dashes: number }

/** Simple, explainable numbers about how a text is written. */
export function styleProfile(text: string): Profile {
  const sample = text.slice(0, 12_000);
  const words: string[] = sample.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const sentences = sample.split(/[.!?…]+(?:\s|$)/).filter((x) => /\p{L}/u.test(x)).length || 1;
  const first = words.slice(0, 400).map((w) => w.toLowerCase());
  const per100 = (re: RegExp) => ((sample.match(re) ?? []).length / Math.max(words.length, 1)) * 100;
  return {
    words: words.length,
    sentence: words.length / sentences,
    wordLength: words.reduce((n: number, w: string) => n + w.length, 0) / Math.max(words.length, 1),
    vocabulary: new Set(first).size / Math.max(first.length, 1),
    commas: per100(/,/g),
    semicolons: per100(/;/g),
    dashes: per100(/ [–—-] /g),
  };
}

const MIN_WORDS = 80;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export interface StyleSignals { baseline: number; differs: { label: string; now: number; usual: number }[] }

/** Compares an answer with the student's earlier answers (other assignments). null: too little to compare. */
export async function styleSignalsFor(studentId: string, assignmentId: string, text: string): Promise<StyleSignals | null> {
  const now = styleProfile(text);
  if (now.words < MIN_WORDS) return null;
  const earlier = (await prisma.assignmentSubmission.findMany({
    where: { studentId, assignmentId: { not: assignmentId } }, orderBy: { submittedAt: 'desc' }, take: 6, select: { text: true },
  })).map((s) => styleProfile(s.text)).filter((p) => p.words >= MIN_WORDS);
  if (earlier.length < 2) return null;
  const usual = { sentence: avg(earlier.map((p) => p.sentence)), wordLength: avg(earlier.map((p) => p.wordLength)), vocabulary: avg(earlier.map((p) => p.vocabulary)), commas: avg(earlier.map((p) => p.commas)), semicolons: avg(earlier.map((p) => p.semicolons)), dashes: avg(earlier.map((p) => p.dashes)) };
  const differs: StyleSignals['differs'] = [];
  const ratio = now.sentence / Math.max(usual.sentence, 1);
  if (ratio >= 1.6 || ratio <= 0.6) differs.push({ label: 'Words per sentence', now: round(now.sentence), usual: round(usual.sentence) });
  if (Math.abs(now.wordLength - usual.wordLength) >= 0.8) differs.push({ label: 'Average word length (letters)', now: round(now.wordLength), usual: round(usual.wordLength) });
  if (Math.abs(now.vocabulary - usual.vocabulary) >= 0.15) differs.push({ label: 'Variety of words (share of different words)', now: round(now.vocabulary, 2), usual: round(usual.vocabulary, 2) });
  if (Math.abs(now.semicolons - usual.semicolons) >= 0.8) differs.push({ label: 'Semicolons per 100 words', now: round(now.semicolons), usual: round(usual.semicolons) });
  if (Math.abs(now.dashes - usual.dashes) >= 0.8) differs.push({ label: 'Dashes per 100 words', now: round(now.dashes), usual: round(usual.dashes) });
  if (Math.abs(now.commas - usual.commas) >= 4) differs.push({ label: 'Commas per 100 words', now: round(now.commas), usual: round(usual.commas) });
  return { baseline: earlier.length, differs };
}

// ─── Voice / video feedback ──────────────────────────────────────────────────────────────────

/** POST { url, kind: 'AUDIO' | 'VIDEO' }: attach an uploaded recording to the submission (teacher). */
export async function saveFeedbackMedia(submissionId: string, user: SessionUser, body: Record<string, unknown>) {
  const { sub } = await submissionForTeacher(submissionId, user);
  const kind = body.kind === 'VIDEO' ? 'VIDEO' : body.kind === 'AUDIO' ? 'AUDIO' : null;
  if (!kind) throw new BadRequestException('Unknown recording type.');
  if (!isAppFileUrl(body.url)) throw new BadRequestException('Upload the recording first.');
  await prisma.assignmentSubmission.update({ where: { id: sub.id }, data: { feedbackMediaUrl: body.url, feedbackMediaKind: kind, feedbackTranscript: null } });
  return { feedbackMediaUrl: body.url, feedbackMediaKind: kind };
}

export async function removeFeedbackMedia(submissionId: string, user: SessionUser) {
  const { sub } = await submissionForTeacher(submissionId, user);
  await prisma.assignmentSubmission.update({ where: { id: sub.id }, data: { feedbackMediaUrl: null, feedbackMediaKind: null, feedbackTranscript: null } });
  return { ok: true };
}

/** POST: a transcript of the recording (one AI request), so the student can read it too. */
export async function transcribeFeedback(submissionId: string, user: SessionUser) {
  const { sub } = await submissionForTeacher(submissionId, user);
  if (!sub.feedbackMediaUrl) throw new BadRequestException('Record feedback first.');
  if (sub.feedbackTranscript) return { transcript: sub.feedbackTranscript };
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message, 429);
  const file = await readAppFile(sub.feedbackMediaUrl);
  if (!file) throw new HttpException('The recording couldn’t be read.', 422);
  const transcript = await geminiAudioText(file.bytes, (file.mime || 'audio/webm').split(';')[0]);
  if (!transcript) throw new HttpException('Couldn’t transcribe right now. Try again in a moment.', 503);
  await prisma.assignmentSubmission.update({ where: { id: sub.id }, data: { feedbackTranscript: transcript.slice(0, 6000) } });
  return { transcript };
}

export const asJson = (v: unknown) => v as Prisma.InputJsonValue;
