import type { SkillId } from './skills';

// The skills where Ghidra's add-on passed more of the exam than the model without it (the training run's wins.json,
// scripts/ai/ghidra-ai.py score; M451). Only these are sent to it (./addon.ts). Change it only from a new run's results.
// Run of 26 Nov (M562, add-on ghidra-20261126-0926): 85% → 94% over the exam (2058 → 2266 of 2410). Higher with it:
// assistant 77→82, boards 67→88, booking 98→100, carbon 95→98, careers 70→83, chat 87→97, class-notes 94→98, concepts
// 90→96, daily-brief 62→92, diagnose 98→100, discussion 93→95, health 38→74, hyperion 95→96, impact-rooms 0→100,
// parents 82→93, passport 50→100, quiz-draft 88→92, quiz-marking 73→95, research 77→100, revision 92→98, semester
// 97→100, social 78→80, study-plan 74→90, support 92→93, syllabus 64→96, translate 90→92, tutor 99→100, whisper 98→100.
// Lower (kept off it): reading-level 92→80, docs 85→80, school-insights 90→88, support-plans 100→98. Hyperion and
// support keep their own Cloudflare paths (./addon.ts skips skills with SKILLS[id].own).
export const ADDON_SKILLS: readonly SkillId[] = ['assistant', 'boards', 'booking', 'carbon', 'careers', 'chat', 'class-notes', 'concepts', 'daily-brief', 'diagnose', 'discussion', 'health', 'hyperion', 'impact-rooms', 'parents', 'passport', 'quiz-draft', 'quiz-marking', 'research', 'revision', 'semester', 'social', 'study-plan', 'support', 'syllabus', 'translate', 'tutor', 'whisper'];
