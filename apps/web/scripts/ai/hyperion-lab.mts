// Hyperion's own engine, for training Hyperion's AI (M435): every script the teacher writes is run here, and only code
// that really runs is kept. Started by scripts/ai/hyperion-lab.mjs (from apps/web):
//
//   node scripts/ai/hyperion-lab.mjs help > help.json             every function Hyperion knows (name, syntax, text, section)
//   node scripts/ai/hyperion-lab.mjs run < in.jsonl > out.jsonl
//   node scripts/ai/hyperion-lab.mjs prompt > system.txt          what Hyperion's AI is told (src/lib/hyperion-ai.ts)
//
// `run` reads one {"id", "code"} per line and writes {"id", "ok", "out", "error", "figures"} per line: what the script
// printed (cut at 2,000 characters), its error in Hyperion's words, and how many figures it drew. Each script runs on a
// background thread with 5 seconds; one that takes longer (a loop that never ends) is stopped and counts as failed.
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { Lab } from '../../src/lib/lab/interp';  // first: the engine's own files load in this order
import { HELP } from '../../src/lib/lab/help';
import { Graphics } from '../../src/lib/lab/plot';
import { HYPERION_SYSTEM } from '../../src/lib/hyperion-ai';

const LIMIT = 5000;
type Result = { ok: boolean; out: string; error: string; figures: number };

function run(code: string): Result {
  let out = '';
  const graphics = new Graphics();
  const lab = new Lab({ out: (t) => { if (out.length < 2000) out += t; }, graphics });
  try {
    lab.run(code);
    return { ok: true, out: out.slice(0, 2000), error: '', figures: graphics.figures.length };
  } catch (e) {
    return { ok: false, out: out.slice(0, 2000), error: e instanceof Error ? e.message : String(e), figures: graphics.figures.length };
  }
}

if (!isMainThread) {
  parentPort!.on('message', (code: string) => parentPort!.postMessage(run(code)));
} else if (process.argv[2] === 'help') {
  process.stdout.write(JSON.stringify([...HELP.values()]) + '\n');
} else if (process.argv[2] === 'prompt') {
  process.stdout.write(HYPERION_SYSTEM + '\n');
} else if (process.argv[2] === 'run') {
  const self = fileURLToPath(import.meta.url);
  let worker = new Worker(self);
  const once = () => new Promise<Result>((done) => {
    const timer = setTimeout(() => {
      void worker.terminate(); worker = new Worker(self);
      done({ ok: false, out: '', error: `Took longer than ${LIMIT / 1000} seconds (stopped).`, figures: 0 });
    }, LIMIT);
    worker.once('message', (r: Result) => { clearTimeout(timer); done(r); });
  });
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    const { id, code } = JSON.parse(line) as { id: string; code: string };
    const answer = once();
    worker.postMessage(String(code ?? ''));
    process.stdout.write(JSON.stringify({ id, ...(await answer) }) + '\n');
  }
  await worker.terminate();
} else {
  console.error('usage: node scripts/ai/hyperion-lab.mjs help | prompt | run < scripts.jsonl');
  process.exit(1);
}
