import { LabError } from './parse';
import { BUILTINS, type Builtin } from './builtins';
import { textOf } from './interp';
import { mat, str, toMat, type Cell, type Struct, type Value } from './values';
import { cast } from './types';
import { waits } from './wait';

// Hyperion's webcam (M555, image processing's camera, like MATLAB's webcam support): webcamlist names the cameras,
// cam = webcam (or webcam(2), webcam('name')) picks one, img = snapshot(cam) takes a picture as rows × columns × 3
// uint8, the same as imread gives, so every image function works on it. The camera is the page's (the engine's thread
// has none): the script waits while the page asks the browser, which asks the person the first time
// (page-answers.ts, 'camera'). Needs the Code window's waiting (cross-origin isolated pages, M521).

const def = (names: string, fn: Builtin) => { for (const n of names.split(' ')) BUILTINS[n] = fn; };
const ask = (body: unknown, ms = 20_000): unknown => {
  if (!waits.page) throw new LabError('The webcam needs the Code window open in a browser that can wait for it (Chrome, Edge or Firefox).');
  // The answer itself (an error comes back thrown); undefined when the page didn't answer in time.
  const r = waits.page('camera', body, ms);
  if (r === undefined) throw new LabError('The camera didn’t answer in time: allow the camera when the browser asks, then try again.');
  return r;
};
const names = (): string[] => ask({ op: 'list' }) as string[];

def('webcamlist', () => {
  const n = names();
  return [{ k: 'cell', r: n.length, c: 1, d: n.map(str) } satisfies Cell];
});
def('webcam', (a) => {
  const list = names();
  if (!list.length) throw new LabError('No camera found on this computer.');
  let name = list[0];
  if (a[0]?.k === 'str') { const want = a[0].v.toLowerCase(); name = list.find((x) => x.toLowerCase().includes(want)) ?? ''; if (!name) throw new LabError(`No camera called “${a[0].v}”: there are ${list.join(', ')}.`); }
  else if (a[0]) { const k = toMat(a[0]).d[0]; if (!(k >= 1 && k <= list.length)) throw new LabError(`There ${list.length === 1 ? 'is 1 camera' : `are ${list.length} cameras`}.`); name = list[k - 1]; }
  let res = '640x480';
  for (let i = 1; i + 1 < a.length; i += 2) if (/^resolution$/i.test(textOf(a[i]))) res = textOf(a[i + 1]);
  const cam: Struct = { k: 'struct', f: new Map<string, Value>([['Name', str(name)], ['Resolution', str(res)], ['AvailableResolutions', { k: 'cell', r: 1, c: 3, d: ['320x240', '640x480', '1280x720'].map(str) }]]) };
  return [cam];
});
def('snapshot', (a) => {
  const cam = a[0];
  if (!cam || cam.k !== 'struct') throw new LabError('snapshot needs a camera: cam = webcam; img = snapshot(cam).');
  const [w, h] = textOf(cam.f.get('Resolution') ?? str('640x480')).split('x').map(Number);
  const pic = ask({ op: 'snap', name: textOf(cam.f.get('Name') ?? str('')), w: w || 640, h: h || 480 }) as { w: number; h: number; rgb: Uint8Array };
  const n = pic.w * pic.h, d = new Float64Array(n * 3);
  for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) { const s = (y * pic.w + x) * 3, t = y + x * pic.h; d[t] = pic.rgb[s]; d[t + n] = pic.rgb[s + 1]; d[t + 2 * n] = pic.rgb[s + 2]; }
  return [cast(mat(pic.h, pic.w, d), 'uint8')];
});
