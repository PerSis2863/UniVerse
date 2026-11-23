import type { SkillId } from './skills';

// The skills where Ghidra's add-on passed more of the exam than the model without it (the training run's wins.json,
// scripts/ai/ghidra-ai.py score; M451). Only these are sent to it (./addon.ts). Change it only from a new run's results.
// Run of 23 Nov (M447): 81% → 85% over the exam. Higher with it: boards 67→70, carbon 95→98, careers 70→100, daily-brief
// 62→100, health 36→84, hyperion 90→95, parents 82→92, passport 50→94, quiz-draft 88→95, quiz-marking 73→88, semester
// 97→100, study-plan 74→90, support 92→93, syllabus 62→96, translate 90→92, tutor 99→100, whisper 98→100. Lower (kept
// off it): reading-level 92→58, concepts 90→72, school-insights 90→82, social 67→58. Hyperion and support keep their
// own Cloudflare paths (./addon.ts skips skills with SKILLS[id].own).
export const ADDON_SKILLS: readonly SkillId[] = ['boards', 'carbon', 'careers', 'daily-brief', 'health', 'hyperion', 'parents', 'passport', 'quiz-draft', 'quiz-marking', 'semester', 'study-plan', 'support', 'syllabus', 'translate', 'tutor', 'whisper'];
