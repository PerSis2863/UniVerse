import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { opHooks } from './interp';
import { mat, num, str, toMat, type Mat, type Struct, type Value } from './values';
import * as G from './gpu';
import { pauseFor } from './parallel-lab';

// Hyperion's GPU computing in the language (M478): gpuArray, gather, gpuDevice, gpuDeviceCount, isgpuarray,
// existsOnGPU; on a gpuArray: + − .* ./ .^ and * (the matrix product), exp, sqrt, abs, sin, cos, tanh, log, sum,
// transpose. A gpuArray is a handle (a struct marked gpu) to a matrix on the graphics chip; anything else needs
// gather first. gather pauses the run while the numbers come back (WebGPU only reads asynchronously), then runs that
// top-level statement again: the operations before it are remembered, so they aren't sent twice.

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const store = new Map<number, G.Gm>();
const live = new Map<number, number>();
// A buffer is given back when no handle to it is left.
const registry = typeof FinalizationRegistry === 'undefined' ? null : new FinalizationRegistry<number>((id) => {
  const n = (live.get(id) ?? 1) - 1;
  if (n > 0) { live.set(id, n); return; }
  live.delete(id);
  const g = store.get(id);
  store.delete(id);
  (g?.buf as { destroy?: () => void } | undefined)?.destroy?.();
});
const where = () => (G.gpuName() ? `GPU: ${G.gpuName()}` : 'no GPU here: on the CPU');
function handle(g: G.Gm): Struct {
  store.set(g.id, g);
  const s: Struct = { k: 'struct', gpu: true, f: new Map<string, Value>([['Size', mat(1, 2, [g.r, g.c])], ['Where', str(where())], ['ID', num(g.id)]]) };
  live.set(g.id, (live.get(g.id) ?? 0) + 1);
  registry?.register(s, g.id);
  return s;
}
const isGpu = (v: Value | undefined): v is Struct => v?.k === 'struct' && !!v.gpu;
const gm = (v: Struct) => { const g = store.get(toMat(v.f.get('ID')!).d[0]); if (!g) throw new LabError('This gpuArray is gone.'); return g; };
/** The same operation on the same values gives the same handle (a statement run again after gather doesn't redo it). */
const memo = new Map<string, number>();
// shortcut: an uploaded matrix's buffer stays until the page closes (handles free theirs when dropped).
const uploads = new WeakMap<object, G.Gm>();
function remember(key: string, make: () => G.Gm): Struct {
  const id = memo.get(key), have = id !== undefined ? store.get(id) : undefined;
  if (have) return handle(have);
  const g = make();
  memo.set(key, g.id);
  if (memo.size > 1000) memo.delete(memo.keys().next().value!);
  return handle(g);
}
function operand(v: Value): { g: G.Gm; key: string } {
  if (isGpu(v)) { const g = gm(v); return { g, key: `#${g.id}` }; }
  const m = toMat(v, 'This');
  if (m.im) throw new LabError('Complex numbers aren’t sent to the GPU here.');
  if (m.d.length === 1) return { g: G.fromHost(1, 1, m.d), key: `=${m.d[0]}` };
  let g = uploads.get(m);
  if (!g) { g = G.fromHost(m.r, m.c, m.d); uploads.set(m, g); store.set(g.id, g); }
  return { g, key: `#${g.id}` };
}
const wrap = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof LabError) throw e; throw new LabError((e as Error).message); } };

opHooks.binop = (op, a, b) => {
  const A = operand(a), B = operand(b), scalar = A.g.r * A.g.c === 1 || B.g.r * B.g.c === 1;
  const key = `${op}|${A.key}|${B.key}`;
  if (op === '*') return remember(key, () => wrap(() => (scalar ? G.elementwise('.*', A.g, B.g) : G.matmul(A.g, B.g))));
  if (op === '/' && B.g.r * B.g.c === 1) return remember(key, () => wrap(() => G.elementwise('./', A.g, B.g)));
  if (op === '^' && B.g.r * B.g.c === 1 && A.g.r * A.g.c === 1) return remember(key, () => wrap(() => G.elementwise('.^', A.g, B.g)));
  if (G.elementOp(op) >= 0) return remember(key, () => wrap(() => G.elementwise(op, A.g, B.g)));
  throw new LabError(`${op} isn’t done on a gpuArray here: gather it first.`);
};

def('gpuArray', (a) => {
  if (isGpu(a[0])) return [a[0]];
  const m = toMat(a[0] ?? mat(0, 0), 'gpuArray’s input');
  if ((m.p ?? 1) > 1) throw new LabError('gpuArray takes a 2D matrix here.');
  const g = G.fromHost(m.r, m.c, m.d);
  return [handle(g)];
});
def('gather', (a) => {
  const v = a[0];
  if (!isGpu(v)) return [v ?? mat(0, 0)];
  const g = gm(v);
  if (!g.cpu) throw pauseFor(() => G.readBack(g));
  return [mat(g.r, g.c, g.cpu)];
});
def('isgpuarray existsOnGPU', (a) => [{ ...num(isGpu(a[0]) ? 1 : 0), logical: true }]);
def('gpuDeviceCount', () => [num(G.onGpu() ? 1 : 0)]);
def('gpuDevice', () => [{ k: 'struct', f: new Map<string, Value>([['Name', str(G.gpuName() ?? 'none')], ['Available', { ...num(G.onGpu() ? 1 : 0), logical: true }], ['Precision', str(G.onGpu() ? 'single' : 'double (CPU)')]]) }]);
// Functions that also take a gpuArray.
for (const name of ['exp', 'sqrt', 'abs', 'sin', 'cos', 'tanh', 'log'] as const) {
  const plain = BUILTINS[name];
  BUILTINS[name] = (a, n, lab) => (isGpu(a[0]) ? [remember(`${name}|#${gm(a[0]).id}`, () => G.unary(name, gm(a[0] as Struct)))] : plain(a, n, lab));
}
for (const [name, f] of [['sum', G.colsum], ['transpose', G.transpose], ['ctranspose', G.transpose]] as const) {
  const plain = BUILTINS[name];
  if (!plain) continue;
  BUILTINS[name] = (a, n, lab) => (isGpu(a[0]) && a.length === 1 ? [remember(`${name}|#${gm(a[0]).id}`, () => f(gm(a[0] as Struct)))] : plain(a, n, lab));
}
const plainNumel = BUILTINS.numel;
BUILTINS.numel = (a, n, lab) => (isGpu(a[0]) ? [num(gm(a[0]).r * gm(a[0]).c)] : plainNumel(a, n, lab));
/** For tests: the numbers of a handle that are already back (null while still on the GPU). */
export const gathered = (v: Value): Mat | null => { if (!isGpu(v)) return null; const g = gm(v); return g.cpu ? mat(g.r, g.c, g.cpu) : null; };
