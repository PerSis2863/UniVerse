/// <reference lib="webworker" />
import '@/lib/lab/interp';
import '@/lib/lab/plot';
import '@/lib/lab/files';
import '@/lib/lab/ml-lab';
import '@/lib/lab/optim-lab';
import '@/lib/lab/calc-lab';
import '@/lib/lab/stats-lab';
import '@/lib/lab/data-lab';
import '@/lib/lab/special-lab';
import '@/lib/lab/maint-lab';
import '@/lib/lab/energy-lab';
import '@/lib/lab/grid-lab';
import '@/lib/lab/comms-lab';
import '@/lib/lab/image-lab';
import '@/lib/lab/radar-lab';
import '@/lib/lab/filters-lab';
import '@/lib/lab/audio-lab';
import '@/lib/lab/codegen-lab';
import '@/lib/lab/embedded-lab';
import '@/lib/lab/des-lab';
import '@/lib/lab/iot-lab';
import '@/lib/lab/wireless-lab';
import { runTask, type Task } from '@/lib/lab/parallel-lab';
import { answer } from '@/lib/lab/wait';

// M477: one of Hyperion's parallel workers (started by the engine's own worker, lab.worker.ts): a whole engine that
// runs its share of a parfor's iterations, or one parfeval call, and answers with the variables it changed.
// M521: a task that comes with a slot of shared memory is answered there (the engine sleeps on it); a ping says ready.
self.onmessage = (e: MessageEvent<{ id: number; task: Task; slot?: SharedArrayBuffer } | { ping: true }>) => {
  if ('ping' in e.data) { postMessage({ ready: true }); return; }
  const { id, task, slot } = e.data, result = runTask(task);
  if (!slot) { postMessage({ id, result }); return; }
  try { answer(slot, result); } catch (err) { answer(slot, { error: err instanceof Error ? err.message : String(err), out: '', ms: 0 }); }
};
