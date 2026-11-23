/// <reference lib="webworker" />
import '@/lib/lab/interp';
import '@/lib/lab/plot';
import '@/lib/lab/files';
import '@/lib/lab/ml-lab';
import '@/lib/lab/optim-lab';
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
import { runTask, type Task } from '@/lib/lab/parallel-lab';

// M477: one of Hyperion's parallel workers (started by the engine's own worker, lab.worker.ts): a whole engine that
// runs its share of a parfor's iterations, or one parfeval call, and answers with the variables it changed.
self.onmessage = (e: MessageEvent<{ id: number; task: Task }>) => {
  const { id, task } = e.data;
  postMessage({ id, result: runTask(task) });
};
