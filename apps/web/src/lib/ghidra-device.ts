// M365: the trained Ghidra (M362, public/ai/ghidra.*) as the corner assistant's backup: when the AI can't answer (offline,
// busy, used up), it asks the small model on this device. Its answer comes back only when the question is close to what
// it was taught (the honesty guard in ghidra.worker.ts); otherwise null, and the assistant says what it would have said.

/** One question to the on-device Ghidra: its answer, or null (it doesn't know yet, can't load, or took too long). */
export function askOnDevice(question: string, timeoutMs = 20_000): Promise<string | null> {
  return new Promise((done) => {
    let w: Worker;
    try { w = new Worker(new URL('./ghidra.worker.ts', import.meta.url)); } catch { done(null); return; }
    let text = '', guarded = false;
    const end = (v: string | null) => { clearTimeout(timer); w.terminate(); done(v); };
    const timer = setTimeout(() => end(null), timeoutMs);
    w.onmessage = (e: MessageEvent<{ text?: string; guard?: boolean; done?: boolean; error?: boolean }>) => {
      if (e.data.guard) guarded = true;
      if (e.data.text) text += e.data.text;
      if (e.data.error) end(null);
      else if (e.data.done) end(guarded || text.trim().length < 2 ? null : text.trim());
    };
    w.postMessage({ prompt: question, ask: true });
  });
}
