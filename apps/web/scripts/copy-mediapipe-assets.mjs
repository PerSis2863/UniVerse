// Copies MediaPipe's vision engine (WebAssembly, ~12 MB) into public/mediapipe/wasm, for call
// backgrounds (src/lib/call-background.ts): the Content-Security-Policy only allows scripts from
// this site. Only downloaded by someone who turns a background on. Runs before builds and `dev`.
// The model itself (public/mediapipe/selfie_segmenter.tflite, 250 KB, Apache 2.0) is in the repo.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const from = path.join(path.dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const to = path.join(process.cwd(), 'public', 'mediapipe', 'wasm');
// The SIMD build, and the one for browsers without SIMD.
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];
for (const f of files) if (!existsSync(path.join(from, f))) throw new Error(`MediaPipe file not found: ${path.join(from, f)}`);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(path.join(from, f), path.join(to, f));
console.log('Copied MediaPipe vision files to public/mediapipe/wasm');
