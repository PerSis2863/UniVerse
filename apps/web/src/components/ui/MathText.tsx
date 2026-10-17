'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { splitMath } from '@/lib/math-text';

// Text with its formulas shown properly (Stage 5 · Q13): maths and chemistry in AI answers, drawn
// by KaTeX as MathML (no style sheet to load; screen readers read it). Until KaTeX has loaded, a
// formula shows as its source. `renderText` handles the plain parts (citation marks, say).

type Katex = typeof import('katex').default;
let ready: Katex | null = null;
let loading: Promise<Katex> | null = null;
// The same copy of KaTeX the chemistry extension adds \ce to (its ES module build).
const loadKatex = () => (loading ??= import('katex/dist/katex.mjs').then(async (m) => { await import('katex/contrib/mhchem'); ready = m.default; return m.default; }));

export function MathText({ text, renderText }: { text: string; renderText?: (text: string) => React.ReactNode }) {
  const parts = useMemo(() => splitMath(text ?? ''), [text]);
  const hasMath = parts.some((p) => p.math);
  const [katex, setKatex] = useState<Katex | null>(ready);
  useEffect(() => {
    if (!hasMath || katex) return;
    let live = true;
    void loadKatex().then((k) => { if (live) setKatex(k); });
    return () => { live = false; };
  }, [hasMath, katex]);
  return (
    <>
      {parts.map((p, i) => {
        if (p.math === false) return <Fragment key={i}>{renderText ? renderText(p.text) : p.text}</Fragment>;
        if (!katex) return <code key={i} className="font-mono text-[0.92em]">{p.tex}</code>;
        const html = katex.renderToString(p.tex, { displayMode: p.display, output: 'mathml', throwOnError: false, strict: 'ignore', trust: false, maxSize: 20, maxExpand: 500 });
        return <span key={i} className={p.display ? 'block my-1.5 overflow-x-auto' : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}
