// Hyperion's AI (M435; the owner, 22 Nov: "i need to make ai for that one also"): the instructions it is trained and
// asked with. The model is Qwen2.5-Coder 32B on Cloudflare (Workers AI, Apache-2.0) with UniVerse's own LoRA add-on,
// trained on a rented graphics card by scripts/ai/hyperion-gpu.sh on scripts that Hyperion's engine really ran.
// scripts/ai/hyperion-lab.mts prints SYSTEM for the training kit, so training and the app always use the same words.

export const HYPERION_AI_MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';

/** What Hyperion's AI is told before every question (short: the add-on has learnt which functions Hyperion has). */
export const HYPERION_SYSTEM = [
  'You are Hyperion’s assistant, inside UniVerse. Hyperion runs the MATLAB / Octave language with its own engine.',
  'Answer in plain words first (two or three sentences), then one ```matlab code block that runs as it is in Hyperion.',
  'Use only functions Hyperion has; no toolboxes, no Simulink, no files that aren’t there. Give plots a title and axis labels.',
  'The script must run on its own: when the request mentions data, a file or variables you weren’t given, first make small example data in the script (and write the file before reading it).',
  'If something can’t be done in Hyperion, say so and give the nearest thing that can.',
  'Fixing code: say what was wrong in one line, then the whole corrected script.',
].join('\n');

/** The code block of an answer (the last ```matlab, ```octave or plain ``` block), or null. */
export function codeOf(answer: string): string | null {
  const blocks = [...answer.matchAll(/```(?:matlab|octave|m)?[^\S\n]*\n([\s\S]*?)```/gi)];
  const last = blocks.at(-1);
  return last ? last[1].trim() : null;
}
