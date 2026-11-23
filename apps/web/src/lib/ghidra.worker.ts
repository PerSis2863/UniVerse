// Ghidra's background thread (M421): loads the model once and writes on from a prompt (or answers a question), sending the
// letters back in small batches, so the page stays smooth while it thinks. Messages in: { prompt, heat, max, ask } to
// write (ask: the prompt is a question, answered on one line), { stop: true } to stop.
// Messages out: { meta } once loaded, { text } as it writes, { done: true } at the end, { error } if it couldn't load.
import { askPrompt, familiar, FAMILIAR, loadGhidra, NOT_YET, write, type Ghidra } from './ghidra';

let model: Promise<Ghidra> | null = null;
let stop: AbortController | null = null;

self.onmessage = async (e: MessageEvent<{ prompt?: string; heat?: number; max?: number; ask?: boolean; stop?: boolean }>) => {
  if (e.data.stop) { stop?.abort(); return; }
  stop?.abort();
  const mine = (stop = new AbortController());
  try {
    model ??= loadGhidra().catch((err: unknown) => { model = null; throw err; });
    const m = await model;
    self.postMessage({ meta: { ...m.meta, shapes: [] } });
    let batch = '';
    const ask = e.data.ask === true;
    // The honesty guard: a question far from everything it was taught gets "I don't know that yet", not a made-up answer.
    // Until it has been taught answers (no `known` list), every question gets the same honest reply.
    if (ask && (!m.meta.known?.length || familiar(e.data.prompt ?? '', m.meta.known) < FAMILIAR)) { self.postMessage({ text: NOT_YET, guard: true }); self.postMessage({ done: true }); return; }
    await write(m, ask ? askPrompt(e.data.prompt ?? '') : e.data.prompt ?? '', (c) => {
      batch += c;
      if (batch.length >= 4) { self.postMessage({ text: batch }); batch = ''; }
    }, { max: Math.min(1000, e.data.max ?? 500), heat: ask ? 0.3 : e.data.heat ?? 0.8, signal: mine.signal, oneLine: ask });
    if (batch) self.postMessage({ text: batch });
    self.postMessage({ done: true });
  } catch {
    self.postMessage({ error: true });
  }
};
