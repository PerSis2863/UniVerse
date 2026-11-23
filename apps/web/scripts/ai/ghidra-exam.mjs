// Ghidra's exam: every skill's questions (src/server/ghidra/exam), asked with the website's own instructions, and the
// score card: how many answers passed their rules, per skill, and which rules failed most. From apps/web:
//
//   node scripts/ai/ghidra-exam.mjs                       ask Ghidra as the website does (its brain: Gemini; needs
//                                                         GEMINI_API_KEY in the shell, the owner's own key)
//   node scripts/ai/ghidra-exam.mjs --via openai --url URL --model M [--key-env NAME]
//                                                         ask any OpenAI-style model instead: UniVerse's own on a rented
//                                                         card (vLLM) or Cloudflare's Workers AI
//                                                         (https://api.cloudflare.com/client/v4/accounts/ID/ai/v1, key in
//                                                         the env var NAME, e.g. CLOUDFLARE_API_TOKEN)
//   --skills support,tutor   only these skills     --per 10   only the first 10 questions of each (a quick look)
//   --jobs 4                 questions at a time   --out DIR  where answers.jsonl, card.txt and card.json go
//                                                            (default exam-runs/<date>, not committed)
//   node scripts/ai/ghidra-exam.mjs --rescore DIR         mark a run's saved answers again with today's rules
//
// Pictures are drawn with the installed Chromium (Playwright); recordings are read aloud by ffmpeg's voice (flite);
// Hyperion's code is run in Hyperion's own engine. Questions a model can't take (recordings, for an OpenAI-style one)
// are listed as not asked.
import { runTs } from './run-ts.mjs';
await runTs('ghidra-exam.mts', { app: true });
