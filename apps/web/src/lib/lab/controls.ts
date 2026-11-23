// Hyperion's live controls (M384, the owner, 22 Nov: features "unique and different from others"): a comment
// after a value in a script turns it into a control the window draws above the code. Moving it rewrites the value in
// the script and runs it again, so the figure follows the hand.
//
//   speed = 5;      % slider 0 10          (or slider(0, 10, 0.5), or slider 0:0.5:10)
//   damped = true;  % toggle
//   shape = 'sine'; % menu sine square triangle

export interface Control {
  name: string;
  kind: 'slider' | 'toggle' | 'menu';
  value: number | boolean | string;
  min: number; max: number; step: number;
  options: string[];
  /** Where the value is written in the script, so it can be replaced. */
  from: number; to: number;
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;
const LINE = new RegExp(`^([ \\t]*)([A-Za-z]\\w*)[ \\t]*=[ \\t]*(${NUM.source}|true|false|'[^'\\n]*'|"[^"\\n]*")[ \\t]*;?[ \\t]*[%#][ \\t]*(slider|toggle|menu)\\b([^\\n]*)$`, 'gm');

/** A tidy step for a range: a hundredth of it, rounded to 1, 2 or 5 × 10ⁿ. */
function niceStep(span: number) {
  const raw = span / 100, mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

export function controlsOf(code: string): Control[] {
  const out: Control[] = [];
  for (const m of code.matchAll(LINE)) {
    const [whole, indent, name, lit, kind, rest] = m;
    const from = m.index! + whole.indexOf(lit, indent.length + name.length), to = from + lit.length;
    if (kind === 'toggle') { out.push({ name, kind, value: lit === 'true' || (lit !== 'false' && Number(lit) !== 0), min: 0, max: 1, step: 1, options: [], from, to }); continue; }
    if (kind === 'menu') {
      const options = rest.replace(/^[\s(]+|[\s)]+$/g, '').split(/[\s,]+/).map((w) => w.replace(/^['"]|['"]$/g, '')).filter(Boolean);
      const value = lit.replace(/^['"]|['"]$/g, '');
      if (!options.includes(value)) options.unshift(value);
      out.push({ name, kind, value, min: 0, max: 0, step: 0, options, from, to });
      continue;
    }
    const v = Number(lit);
    if (!Number.isFinite(v)) continue;
    const nums = (rest.match(new RegExp(NUM.source, 'g')) ?? []).map(Number);
    let min: number, max: number, step: number;
    // a:step:b, or min max [step], or nothing (0 to twice the value).
    if (/:/.test(rest) && nums.length >= 3) [min, step, max] = nums;
    else if (/:/.test(rest) && nums.length === 2) [min, max, step] = [nums[0], nums[1], niceStep(nums[1] - nums[0])];
    else if (nums.length >= 2) [min, max, step] = [nums[0], nums[1], nums[2] ?? niceStep(nums[1] - nums[0])];
    else { min = Math.min(0, v * 2); max = Math.max(1, v * 2, v); step = niceStep(max - min); }
    if (!(max > min) || !(step > 0)) continue;
    out.push({ name, kind: 'slider', value: v, min, max, step, options: [], from, to });
  }
  return out;
}

/** How many decimals a slider's step needs (0.25 → 2). */
export const stepDecimals = (step: number) => { for (let d = 0; d < 10; d++) { const s = step * 10 ** d; if (Math.abs(s - Math.round(s)) < 1e-6) return d; } return 10; };

/** The script with a control's value replaced (a number written to its step's decimals). */
export function setControl(code: string, c: Control, v: number | boolean | string): string {
  let lit: string;
  if (c.kind === 'toggle') lit = v ? 'true' : 'false';
  else if (c.kind === 'menu') lit = `'${String(v).replace(/'/g, '')}'`;
  else lit = String(+Number(v).toFixed(stepDecimals(c.step)));
  return code.slice(0, c.from) + lit + code.slice(c.to);
}
