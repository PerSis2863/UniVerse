// Maths and chemistry in AI answers (Stage 5 · Q13): the parts of a text that are formulas, written
// as $…$ (or $$…$$, \(…\), \[…\] on their own line) or chemistry as \ce{…}, so they can be shown
// with KaTeX. Money like "$5 and $10" stays text: a formula's dollars hug it ("$x$", not "$ x $").

export type MathPart = { math: false; text: string } | { math: true; tex: string; display: boolean };

const RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=[^\s$])((?:\\\$|[^$\n])*?[^\s\\$])\$(?!\d)|(\\ce\{(?:[^{}]|\{[^{}]*\})*\})/g;

export function splitMath(text: string): MathPart[] {
  const out: MathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ math: false, text: text.slice(last, at) });
    const display = m[1] != null || m[2] != null;
    out.push({ math: true, tex: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim(), display });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ math: false, text: text.slice(last) });
  return out;
}
