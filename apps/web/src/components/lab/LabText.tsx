'use client';

import { useEffect, useState } from 'react';

// Hyperion's output with typeset maths (M396): a symbolic result arrives as \u0001 LaTeX \u0002 plain text \u0003 (values.ts
// `symShown`); it is set as real maths (KaTeX to MathML, which the browser draws, so no style sheet is needed), and
// its plain text stays for screen readers, copying and when KaTeX hasn't loaded yet. Everything else is plain text.

type Katex = typeof import('katex').default;
let ready: Katex | null = null;
let loading: Promise<Katex> | null = null;
const loadKatex = () => (loading ??= import('katex/dist/katex.mjs').then((m) => (ready = m.default)));
const MATH = /\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003/g;

/** KaTeX, loaded the first time something needs it (null until then). */
export function useKatex(need: boolean): Katex | null {
  const [katex, setKatex] = useState<Katex | null>(ready);
  useEffect(() => {
    if (!need || katex) return;
    let live = true;
    void loadKatex().then((k) => { if (live) setKatex(k); });
    return () => { live = false; };
  }, [need, katex]);
  return katex;
}
/** A formula as MathML (KaTeX, trust off), or the LaTeX itself while KaTeX loads. */
export const mathml = (katex: Katex | null, tex: string, display: boolean) => (katex
  ? katex.renderToString(display ? `\\displaystyle ${tex}` : tex, { displayMode: false, output: 'mathml', throwOnError: false, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 500 })
  : `<code>${tex.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>`);

export function LabText({ text }: { text: string }) {
  const hasMath = text.includes('\u0001');
  const katex = useKatex(hasMath);
  if (!hasMath) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, tex, plain] = m;
    if (katex) {
      // Set at display size but lined up on the left with the rest of the output.
      const html = mathml(katex, tex, true);
      // KaTeX's own MathML (from our own LaTeX, trust off).
      parts.push(<span key={k++} className="inline-block max-w-full overflow-x-auto align-middle text-[1.15em]" dangerouslySetInnerHTML={{ __html: html }} />);
    } else parts.push(plain);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
