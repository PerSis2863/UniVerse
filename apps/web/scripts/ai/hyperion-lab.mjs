// Starts scripts/ai/hyperion-lab.mts (Hyperion's engine for training its AI, M435): the engine's files import each other
// in a circle that only loads in ES-module order, so they are bundled first (run-ts.mjs).
// From apps/web:   node scripts/ai/hyperion-lab.mjs help | run < scripts.jsonl
import { runTs } from './run-ts.mjs';
await runTs('hyperion-lab.mts');
