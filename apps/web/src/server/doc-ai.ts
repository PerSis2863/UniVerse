import type { SessionUser } from '@/lib/server-auth';
import { DOC_AI_ACTIONS, isDocAiAction, type DocAiAction } from '@/lib/doc-ai';
import { isLanguage, languageName } from '@/lib/languages';
import { cachedAi, saveAi, spendAi } from './ai-budget';
import { logAiUse } from './ai-receipts';
import { geminiText } from './gemini';
import { BadRequestException, ForbiddenException, HttpException } from './http';
import { featureOff } from './moderation';
import { docRights } from './docs';

// The AI writing helper in docs (Stage 5 · B9.4; src/lib/doc-ai.ts): one AI request per action on
// the text someone selected (or the text before the cursor, to continue it). Nothing changes in
// the document here: the app shows the answer next to the original and the writer decides.
// The same text and action within a week is answered from the saved answer, at no cost.

const SYSTEM: Record<DocAiAction, string> = {
  improve: 'You improve a student\'s writing: clearer, better structured and more natural, keeping the meaning, facts, tone and language. Reply with only the improved text, no comments or quotes.',
  shorten: 'You shorten text: keep every important point, cut repetition and filler, roughly half as long. Same language. Reply with only the shorter text.',
  grammar: 'You correct spelling, grammar and punctuation only. Do not rephrase or change the style or meaning. Same language. Reply with only the corrected text.',
  explain: 'You explain a passage to a student in simple words: what it means and any hard terms, in 2 to 5 short sentences. Answer in the language of the passage.',
  translate: 'You translate text faithfully and naturally. Keep names, numbers and line breaks. Reply with only the translation.',
  continue: 'You continue a student\'s writing with 2 to 4 sentences that follow on naturally, in the same language, style and point of view. Do not repeat what is there. Reply with only the new sentences.',
};

/** POST /api/docs/:id/ai { action, text, lang? } → { text } */
export async function docAi(docId: string, user: SessionUser, b: Record<string, unknown>) {
  const action = isDocAiAction(b.action) ? b.action : null;
  if (!action) throw new BadRequestException('Unknown action.');
  const { title, canEdit } = await docRights(docId, user);
  if (action !== 'explain' && !canEdit) throw new ForbiddenException('You can only read this document.');
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, action === 'continue' ? 3000 : 6000) : '';
  if (text.length < 2) throw new BadRequestException(action === 'continue' ? 'Write something first, then ask to continue it.' : 'Select some text first.');
  const lang = action === 'translate' ? (isLanguage(b.lang) ? b.lang : null) : null;
  if (action === 'translate' && !lang) throw new BadRequestException('Choose a language.');
  if (!process.env.GEMINI_API_KEY || (await featureOff('ai'))) throw new HttpException('AI isn’t available right now.', 503);
  // On the person's own record of AI help (Stage 5 · D12).
  await logAiUse(user.id, { kind: 'writing', detail: `${DOC_AI_ACTIONS.find((x) => x.id === action)?.label ?? action} in “${title}”` });

  const key = ['doc-ai', action, lang ?? '', text];
  const saved = action === 'continue' ? null : await cachedAi<{ text: string }>(key);
  if (saved?.text) return { text: saved.text, saved: true };
  const spend = await spendAi(user);
  if (!spend.ok) throw new HttpException(spend.message || 'You’ve used today’s AI allowance.', 429);
  const prompt = action === 'translate' ? `Translate into ${languageName(lang!)}:\n\n${text}`
    : action === 'continue' ? `Document: ${title}\n\nThe writing so far (continue from its end):\n${text}`
    : text;
  const out = await geminiText(SYSTEM[action], prompt, Math.min(2000, Math.max(300, Math.round(text.length / 2.5))), action === 'grammar' || action === 'translate');
  const clean = out?.replace(/^["“]|["”]$/g, '').trim();
  if (!clean) throw new HttpException('The AI didn’t answer. Please try again.', 502);
  if (action !== 'continue') await saveAi(key, { text: clean });
  return { text: clean, left: spend.left };
}
