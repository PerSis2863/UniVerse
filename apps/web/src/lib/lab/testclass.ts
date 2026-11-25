import { LabError } from './parse';

// Hyperion reads MATLAB's class-based tests (M523): a file `classdef Name < matlab.unittest.TestCase` with properties
// blocks (plain, or TestParameter) and methods blocks (Test, TestMethodSetup / Teardown, TestClassSetup / Teardown, or
// plain helpers). The engine has no classes, so this only finds the blocks and their text: the runner (verify-lab.ts)
// parses each methods block's functions with the engine's own parser. Our own code.

export interface Block { kind: 'properties' | 'methods'; attrs: string[]; code: string; line: number }
export interface TestClass { name: string; blocks: Block[] }

const OPENERS = new Set(['if', 'for', 'parfor', 'while', 'switch', 'try', 'function', 'properties', 'methods', 'events', 'enumeration', 'classdef', 'spmd']);
/** A line without its comment and strings, so that only code words are left ('…' strings, "…" strings, % comments). */
function codeOf(line: string): string {
  let out = '', i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '%' || (ch === '.' && line.startsWith('...', i))) break;
    if (ch === '"' || (ch === "'" && !/[\w)\]}.']$/.test(out.trimEnd()) )) {
      const q = ch;
      i++;
      while (i < line.length) { if (line[i] === q) { if (line[i + 1] === q) { i += 2; continue; } break; } i++; }
      out += ' S ';
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
/** Block openers and `end`s on a line, outside brackets (x(end) is an index, not a block's end). */
function words(line: string, depth: { b: number }): ('open' | 'end')[] {
  const out: ('open' | 'end')[] = [], code = codeOf(line);
  const re = /[([{]|[)\]}]|[A-Za-z_]\w*/g;
  let m: RegExpExecArray | null, first = true;
  while ((m = re.exec(code))) {
    const w = m[0];
    if (w === '(' || w === '[' || w === '{') { depth.b++; continue; }
    if (w === ')' || w === ']' || w === '}') { depth.b = Math.max(0, depth.b - 1); continue; }
    if (depth.b) continue;
    // A word after a dot is a field (s.end, obj.properties), not a keyword.
    const before = code.slice(0, m.index).trimEnd();
    if (before.endsWith('.')) continue;
    if (/^end(for|if|while|switch|function|_try_catch|parfor)?$/.test(w)) out.push('end');
    else if (OPENERS.has(w) && (first || /[;,]$/.test(before))) out.push('open');
    first = false;
  }
  return out;
}

/** The class's name and blocks; null when the code isn't a test class. */
export function readTestClass(code: string): TestClass | null {
  const lines = code.split(/\r?\n/);
  const head = lines.findIndex((l) => codeOf(l).trim());
  if (head < 0) return null;
  const m = /^\s*classdef\s*(?:\([^)]*\)\s*)?(\w+)\s*<\s*([\w.]+)/.exec(codeOf(lines[head]));
  if (!m) return null;
  if (m[2] !== 'matlab.unittest.TestCase') throw new LabError(`${m[1]} is a class (${m[2]}): Hyperion runs classes only as tests (classdef ${m[1]} < matlab.unittest.TestCase).`);
  const blocks: Block[] = [], depth = { b: 0 };
  let level = 1, open: { kind: Block['kind']; attrs: string[]; from: number } | null = null;
  for (let i = head + 1; i < lines.length; i++) {
    const before = level, ws = words(lines[i], depth);
    if (level === 1 && !open) {
      const b = /^\s*(properties|methods)\b\s*(?:\(([^)]*)\))?/.exec(codeOf(lines[i]));
      if (b) open = { kind: b[1] as Block['kind'], attrs: (b[2] ?? '').split(',').map((x) => x.trim().replace(/\s*=\s*true$/i, '')).filter(Boolean), from: i + 1 };
      else if (/^\s*(events|enumeration)\b/.test(lines[i])) open = null;
    }
    for (const w of ws) level += w === 'open' ? 1 : -1;
    if (open && before >= 2 && level === 1) {
      blocks.push({ kind: open.kind, attrs: open.attrs, code: lines.slice(open.from, i).join('\n'), line: open.from + 1 });
      open = null;
    }
    if (level <= 0) return { name: m[1], blocks };
  }
  throw new LabError(`classdef ${m[1]} needs its closing end (and so does each properties / methods block).`);
}
