import type { SkillId } from './skills';

// The skills where Ghidra's add-on passed more of the exam than the model without it (the training run's wins.json,
// scripts/ai/ghidra-ai.py score; M451). Only these are sent to it (./addon.ts). Change it only from a new run's results.
export const ADDON_SKILLS: readonly SkillId[] = [];
