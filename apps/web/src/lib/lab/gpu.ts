// Hyperion's GPU computing (M478): matrices on the graphics chip through WebGPU (single precision, as graphics chips
// work fastest), with compute shaders for the matrix product (16×16 tiles in shared memory), element-wise arithmetic,
// a few functions and column sums. Column-major, as the engine stores matrices. Where WebGPU isn't there (Firefox and
// Safari for now, or no graphics chip) the same calls run on the CPU in double precision. Our own shaders.

// The few WebGPU names used here (TypeScript's DOM types don't include WebGPU yet).
interface GPUBuffer { destroy(): void; mapAsync(mode: number): Promise<void>; getMappedRange(): ArrayBuffer; unmap(): void }
interface GPass { setPipeline(p: GPipeline): void; setBindGroup(i: number, g: unknown): void; dispatchWorkgroups(x: number, y?: number): void; end(): void }
interface GEncoder { beginComputePass(): GPass; copyBufferToBuffer(a: GPUBuffer, ao: number, b: GPUBuffer, bo: number, n: number): void; finish(): unknown }
interface GPipeline { getBindGroupLayout(i: number): unknown }
interface GPUDevice {
  createBuffer(o: { size: number; usage: number }): GPUBuffer;
  queue: { writeBuffer(b: GPUBuffer, offset: number, data: Float32Array | Uint32Array): void; submit(c: unknown[]): void };
  createComputePipeline(o: { layout: 'auto'; compute: { module: unknown; entryPoint: string } }): GPipeline;
  createShaderModule(o: { code: string }): unknown;
  createBindGroup(o: { layout: unknown; entries: { binding: number; resource: { buffer: GPUBuffer } }[] }): unknown;
  createCommandEncoder(): GEncoder;
  lost?: Promise<unknown>;
}
interface GAdapter { requestDevice(): Promise<GPUDevice>; info?: { vendor?: string; architecture?: string; description?: string } }

export interface Gm { r: number; c: number; buf?: GPUBuffer; cpu?: Float64Array; id: number }
let device: GPUDevice | null = null, name = '', tried = false;
let nextId = 1;
const STORAGE = 0x80 | 0x4 | 0x8, READ = 0x1 | 0x8; // STORAGE | COPY_SRC | COPY_DST ; MAP_READ | COPY_DST
const UNIFORM = 0x40 | 0x8;

/** Asks the browser for a graphics chip once (call when the engine starts: requestAdapter is asynchronous). */
export async function initGpu(): Promise<string | null> {
  if (tried) return device ? name : null;
  tried = true;
  try {
    const gpu = (globalThis.navigator as unknown as { gpu?: { requestAdapter(o?: unknown): Promise<GAdapter | null> } })?.gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
    const info = adapter.info ?? {};
    name = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'graphics chip';
    device.lost?.then(() => { device = null; });
    return name;
  } catch { device = null; return null; }
}
export const gpuName = () => (device ? name : null);
export const onGpu = () => !!device;

function upload(data: ArrayLike<number>): GPUBuffer {
  const f = Float32Array.from(data), buf = device!.createBuffer({ size: Math.max(16, f.byteLength), usage: STORAGE });
  device!.queue.writeBuffer(buf, 0, f);
  return buf;
}
const empty = (n: number) => device!.createBuffer({ size: Math.max(16, n * 4), usage: STORAGE });
export function fromHost(r: number, c: number, d: ArrayLike<number>, cpuOnly = false): Gm {
  return device && !cpuOnly ? { r, c, buf: upload(d), id: nextId++ } : { r, c, cpu: Float64Array.from(d), id: nextId++ };
}

/** A matrix made before the graphics chip was ready (on the CPU) moves to it when it meets a GPU matrix. */
const onDevice = (...gs: Gm[]) => { for (const g of gs) if (!g.buf && g.cpu) g.buf = upload(g.cpu); };
const allCpu = (...gs: Gm[]) => !device || gs.every((g) => g.cpu && !g.buf);
const pipelines = new Map<string, GPipeline>();
function run(code: string, buffers: (GPUBuffer | undefined)[], uniforms: number[], groups: [number, number]) {
  const device_ = device!;
  let p = pipelines.get(code);
  if (!p) { p = device_.createComputePipeline({ layout: 'auto', compute: { module: device_.createShaderModule({ code }), entryPoint: 'main' } }); pipelines.set(code, p); }
  const u = device_.createBuffer({ size: 16 * Math.ceil(uniforms.length / 4) || 16, usage: UNIFORM });
  device_.queue.writeBuffer(u, 0, Uint32Array.from(uniforms.map((x) => x >>> 0)));
  const bind = device_.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [...buffers.map((b, i) => ({ binding: i, resource: { buffer: b! } })), { binding: buffers.length, resource: { buffer: u } }] });
  const enc = device_.createCommandEncoder(), pass = enc.beginComputePass();
  pass.setPipeline(p); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(groups[0], groups[1]); pass.end();
  device_.queue.submit([enc.finish()]);
}

// ——— Shaders ———
const MATMUL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
struct Dims { m: u32, k: u32, n: u32, pad: u32 }
@group(0) @binding(3) var<uniform> d: Dims;
var<workgroup> ta: array<array<f32, 16>, 16>;
var<workgroup> tb: array<array<f32, 16>, 16>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  let row = g.x; let col = g.y;
  var acc = 0.0;
  let tiles = (d.k + 15u) / 16u;
  for (var t = 0u; t < tiles; t++) {
    let ak = t * 16u + l.y; let bk = t * 16u + l.x;
    ta[l.x][l.y] = select(0.0, A[row + ak * d.m], row < d.m && ak < d.k);
    tb[l.x][l.y] = select(0.0, B[bk + col * d.k], bk < d.k && col < d.n);
    workgroupBarrier();
    for (var i = 0u; i < 16u; i++) { acc += ta[l.x][i] * tb[i][l.y]; }
    workgroupBarrier();
  }
  if (row < d.m && col < d.n) { C[row + col * d.m] = acc; }
}`;
/** Element-wise a ∘ b: op 0 + · 1 − · 2 .* · 3 ./ · 4 .^ ; b a scalar when sb = 1, a a scalar when sa = 1. */
const ELEMENT = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read_write> C: array<f32>;
struct P { n: u32, op: u32, sa: u32, sb: u32 }
@group(0) @binding(3) var<uniform> p: P;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x + g.y * 65535u * 256u;
  if (i >= p.n) { return; }
  let a = A[select(i, 0u, p.sa == 1u)]; let b = B[select(i, 0u, p.sb == 1u)];
  var r = 0.0;
  switch (p.op) { case 0u: { r = a + b; } case 1u: { r = a - b; } case 2u: { r = a * b; } case 3u: { r = a / b; } default: { r = pow(a, b); } }
  C[i] = r;
}`;
const UNARY_OPS = ['exp', 'sqrt', 'abs', 'sin', 'cos', 'tanh', 'log', 'negate'] as const;
export type Unary = (typeof UNARY_OPS)[number];
const UNARY = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read_write> C: array<f32>;
struct P { n: u32, op: u32, pad0: u32, pad1: u32 }
@group(0) @binding(2) var<uniform> p: P;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x + g.y * 65535u * 256u;
  if (i >= p.n) { return; }
  let a = A[i];
  var r = 0.0;
  switch (p.op) { case 0u: { r = exp(a); } case 1u: { r = sqrt(a); } case 2u: { r = abs(a); } case 3u: { r = sin(a); } case 4u: { r = cos(a); } case 5u: { r = tanh(a); } case 6u: { r = log(a); } default: { r = -a; } }
  C[i] = r;
}`;
const TRANSPOSE = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read_write> C: array<f32>;
struct P { r: u32, c: u32, pad0: u32, pad1: u32 }
@group(0) @binding(2) var<uniform> p: P;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= p.r || g.y >= p.c) { return; }
  C[g.y + g.x * p.c] = A[g.x + g.y * p.r];
}`;
const COLSUM = /* wgsl */ `
@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read_write> C: array<f32>;
struct P { r: u32, c: u32, pad0: u32, pad1: u32 }
@group(0) @binding(2) var<uniform> p: P;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= p.c) { return; }
  var s = 0.0;
  for (var i = 0u; i < p.r; i++) { s += A[i + g.x * p.r]; }
  C[g.x] = s;
}`;
const groups1 = (n: number): [number, number] => { const g = Math.ceil(n / 256); return g <= 65535 ? [g, 1] : [65535, Math.ceil(g / 65535)]; };

// ——— Operations (GPU, or the CPU when there is none) ———
export function matmul(a: Gm, b: Gm): Gm {
  if (a.c !== b.r) throw new Error(`The inner sizes must agree: ${a.r}×${a.c} times ${b.r}×${b.c}.`);
  if (allCpu(a, b)) {
    const out = new Float64Array(a.r * b.c);
    const A = a.cpu!, B = b.cpu!;
    for (let j = 0; j < b.c; j++) for (let k = 0; k < a.c; k++) { const bk = B[k + j * b.r]; if (!bk) continue; for (let i = 0; i < a.r; i++) out[i + j * a.r] += A[i + k * a.r] * bk; }
    return { r: a.r, c: b.c, cpu: out, id: nextId++ };
  }
  onDevice(a, b);
  const C = empty(a.r * b.c);
  run(MATMUL, [a.buf, b.buf, C], [a.r, a.c, b.c, 0], [Math.ceil(a.r / 16), Math.ceil(b.c / 16)]);
  return { r: a.r, c: b.c, buf: C, id: nextId++ };
}
const OPS = ['+', '-', '.*', './', '.^'];
export const elementOp = (op: string) => OPS.indexOf(op);
export function elementwise(op: string, a: Gm, b: Gm): Gm {
  const k = elementOp(op), sa = a.r * a.c === 1, sb = b.r * b.c === 1;
  if (k < 0) throw new Error(`${op} isn’t done on the GPU here.`);
  if (!sa && !sb && (a.r !== b.r || a.c !== b.c)) throw new Error(`The sizes must agree: ${a.r}×${a.c} and ${b.r}×${b.c}.`);
  const [r, c] = sa ? [b.r, b.c] : [a.r, a.c], n = r * c;
  if (allCpu(a, b)) {
    const f = [(x: number, y: number) => x + y, (x: number, y: number) => x - y, (x: number, y: number) => x * y, (x: number, y: number) => x / y, (x: number, y: number) => x ** y][k];
    return { r, c, cpu: Float64Array.from({ length: n }, (_, i) => f(a.cpu![sa ? 0 : i], b.cpu![sb ? 0 : i])), id: nextId++ };
  }
  onDevice(a, b);
  const C = empty(n);
  run(ELEMENT, [a.buf, b.buf, C], [n, k, sa ? 1 : 0, sb ? 1 : 0], groups1(n));
  return { r, c, buf: C, id: nextId++ };
}
export function unary(op: Unary, a: Gm): Gm {
  const n = a.r * a.c;
  if (allCpu(a)) {
    const f = { exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tanh: Math.tanh, log: Math.log, negate: (x: number) => -x }[op];
    return { r: a.r, c: a.c, cpu: a.cpu!.map(f), id: nextId++ };
  }
  onDevice(a);
  const C = empty(n);
  run(UNARY, [a.buf, C], [n, UNARY_OPS.indexOf(op), 0, 0], groups1(n));
  return { r: a.r, c: a.c, buf: C, id: nextId++ };
}
export function transpose(a: Gm): Gm {
  if (allCpu(a)) { const out = new Float64Array(a.r * a.c); const src = a.cpu!; for (let j = 0; j < a.c; j++) for (let i = 0; i < a.r; i++) out[j + i * a.c] = src[i + j * a.r]; return { r: a.c, c: a.r, cpu: out, id: nextId++ }; }
  onDevice(a);
  const C = empty(a.r * a.c);
  run(TRANSPOSE, [a.buf, C], [a.r, a.c, 0, 0], [Math.ceil(a.r / 16), Math.ceil(a.c / 16)]);
  return { r: a.c, c: a.r, buf: C, id: nextId++ };
}
export function colsum(a: Gm): Gm {
  const [r, c] = a.r === 1 ? [a.c, 1] : [a.r, a.c]; // a row vector sums along itself, as sum does
  if (allCpu(a)) { const src = a.cpu!, out = new Float64Array(c); for (let j = 0; j < c; j++) { let s = 0; for (let i = 0; i < r; i++) s += src[i + j * r]; out[j] = s; } return { r: 1, c, cpu: out, id: nextId++ }; }
  onDevice(a);
  const C = empty(c);
  run(COLSUM, [a.buf, C], [r, c, 0, 0], groups1(c));
  return { r: 1, c, buf: C, id: nextId++ };
}
/** Copies a matrix back from the graphics chip (asynchronous: the run pauses for it). */
export async function readBack(a: Gm): Promise<void> {
  if (a.cpu || !device || !a.buf) return;
  const n = a.r * a.c, out = device.createBuffer({ size: Math.max(16, n * 4), usage: READ }), enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(a.buf, 0, out, 0, Math.max(16, n * 4));
  device.queue.submit([enc.finish()]);
  await out.mapAsync(1);
  a.cpu = Float64Array.from(new Float32Array(out.getMappedRange()).subarray(0, n));
  out.unmap(); out.destroy();
}
