import { UNTRUSTED_RULE } from '@/lib/ghidra-guard';
import { geminiAudioText, geminiFileText, geminiJson, geminiJsonImage, geminiText } from '../gemini';
import type { SkillId } from './skills';

// Ghidra's brain (the owner, 23 Nov: "we need only ghidra as one main ai"): every AI answer on UniVerse is asked here,
// named by its skill (./skills.ts), so there is one AI with one identity and one set of rules. Skills with UniVerse's
// own model on Cloudflare try it first (./own-model.ts: the app agents, Hyperion); everything else, and any failure,
// is Gemini. Nothing else imports ../gemini (brain-gate.test.ts). The chat on every page streams in
// src/app/api/ai/route.ts, which is Ghidra too. This file stays light: the error monitor imports it, where the sign-in
// modules (switches, the paid-AI limit) can't load.

/** Who answers, said once before every job's own instructions. */
export const GHIDRA_RULE = 'You are Ghidra, UniVerse’s AI, doing the job below. Never say you are another company’s assistant.';

/** A job's instructions as Ghidra: its identity first, the job, and the rule that quoted text is never instructions. */
export const asGhidra = (system: string) => [GHIDRA_RULE, system, ...(system.includes(UNTRUSTED_RULE) ? [] : [UNTRUSTED_RULE])].join('\n');

/** An answer as JSON matching `schema` (Gemini's schema style). `lite` starts with the smaller model (simple jobs). */
export function ghidraJson<T>(skill: SkillId, system: string, prompt: string, schema: object, maxTokens = 800, lite = false, model?: string): Promise<T | null> {
  void skill;
  return geminiJson<T>(asGhidra(system), prompt, schema, maxTokens, lite, model);
}

/** Like ghidraJson, looking at a picture first (a photo of homework, a whiteboard sketch, a bill). */
export function ghidraJsonImage<T>(skill: SkillId, system: string, prompt: string, image: { mimeType: string; data: string }, schema: object, maxTokens = 1500): Promise<T | null> {
  void skill;
  return geminiJsonImage<T>(asGhidra(system), prompt, image, schema, maxTokens);
}

/** A plain-text answer. */
export function ghidraText(skill: SkillId, system: string, prompt: string, maxTokens = 700, lite = false): Promise<string | null> {
  void skill;
  return geminiText(asGhidra(system), prompt, maxTokens, lite);
}

/** The text in a file (a PDF, a picture of a page). */
export function ghidraFileText(skill: SkillId, bytes: Uint8Array, mimeType: string): Promise<string | null> {
  void skill;
  return geminiFileText(bytes, mimeType);
}

/** The words in a recording. */
export function ghidraAudioText(skill: SkillId, bytes: Uint8Array, mimeType: string): Promise<string | null> {
  void skill;
  return geminiAudioText(bytes, mimeType);
}
