// Hyperion's notebook pages (M397, the owner's 20 big features: "combine 2 features into one"): a script read as a
// document and published from the same place. `%% Title` starts a section; the `%` lines under it are its text (with
// **bold**, *italic*, `code`, lists and maths between $…$ or $$…$$); the rest is its code, run section by section with
// its output and figures under it. The same pages download as a report: HTML (maths as MathML, figures as SVG) or LaTeX
// (sections, listings, the figures as pgfplots).

export type Block = { kind: 'text'; text: string } | { kind: 'code'; code: string; line: number };
export interface Section { title: string; blocks: Block[]; code: string; line: number }
/** What a section printed and drew when it last ran. */
export interface SectionOut { text: string; error?: string; figs: { id: number; light: string; tex: string }[] }

const COMMENT = /^\s*[%#](?![%{}])\s?(.*)$/;
/** The script as sections of text and code. */
export function notebookOf(src: string): Section[] {
  const lines = src.replace(/\r/g, '').split('\n');
  const out: Section[] = [];
  let cur: Section = { title: '', blocks: [], code: '', line: 1 };
  let body: string[] = [];
  let inBlockComment = false;
  const close = () => { cur.code = body.join('\n'); if (cur.blocks.length || cur.title) out.push(cur); };
  const push = (kind: 'text' | 'code', text: string, line: number) => {
    const last = cur.blocks[cur.blocks.length - 1];
    if (last?.kind === 'text' && kind === 'text') last.text += `\n${text}`;
    else if (last?.kind === 'code' && kind === 'code') last.code += `\n${text}`;
    else cur.blocks.push(kind === 'text' ? { kind, text } : { kind, code: text, line });
  };
  lines.forEach((raw, i) => {
    const n = i + 1;
    if (/^\s*%%/.test(raw)) { close(); cur = { title: raw.replace(/^\s*%%\s?/, '').trim(), blocks: [], code: '', line: n }; body = []; return; }
    body.push(raw);
    if (/^\s*%\{\s*$/.test(raw)) { inBlockComment = true; return; }
    if (inBlockComment) { if (/^\s*%\}\s*$/.test(raw)) inBlockComment = false; else push('text', raw.trim(), n); return; }
    const m = COMMENT.exec(raw);
    if (m) { push('text', m[1], n); return; }
    if (!raw.trim()) {
      // A blank line ends a paragraph of text; inside code it stays.
      const last = cur.blocks[cur.blocks.length - 1];
      if (last?.kind === 'text') last.text += '\n';
      else if (last?.kind === 'code') last.code += '\n';
      return;
    }
    push('code', raw, n);
  });
  close();
  for (const s of out) for (const b of s.blocks) { if (b.kind === 'code') b.code = b.code.replace(/\n+$/, ''); else b.text = b.text.trim(); }
  for (const s of out) s.blocks = s.blocks.filter((b) => (b.kind === 'text' ? b.text : b.code.trim()));
  return out.length ? out : [{ title: '', blocks: [], code: src, line: 1 }];
}

// ——— Text: a little Markdown, with maths ———

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Inline pieces: maths first (left as it is), then **bold**, *italic*, `code`. */
function inlineParts(s: string): { math?: string; display?: boolean; text?: string }[] {
  const out: { math?: string; display?: boolean; text?: string }[] = [];
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ math: (m[1] ?? m[2]).trim(), display: m[1] !== undefined });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
const styleHtml = (t: string) => escHtml(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
/** Text as HTML; `math(tex, display)` sets each formula (its own escaping). A formula between $$…$$ stands on its own
 *  line between paragraphs. */
export function textHtml(text: string, math: (tex: string, display: boolean) => string): string {
  return text.split(/\n\s*\n/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inlineHtml(l.replace(/^\s*[-*]\s+/, ''), math)}</li>`).join('')}</ul>`;
    const out: string[] = [];
    let run = '';
    for (const p of inlineParts(lines.join(' '))) {
      if (p.math !== undefined && p.display) { if (run.trim()) out.push(`<p>${run.trim()}</p>`); run = ''; out.push(`<div class="nb-display">${math(p.math, true)}</div>`); }
      else run += p.math !== undefined ? math(p.math, false) : styleHtml(p.text ?? '');
    }
    if (run.trim()) out.push(`<p>${run.trim()}</p>`);
    return out.join('');
  }).join('');
}
const inlineHtml = (s: string, math: (tex: string, display: boolean) => string) => inlineParts(s).map((p) => (p.math !== undefined ? math(p.math, p.display ?? false) : styleHtml(p.text ?? ''))).join('');

const escTex = (s: string) => s.replace(/\\/g, '\\textbackslash{}').replace(/([#$%&_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
/** `code`, **bold**, *italic* as LaTeX (everything else escaped). */
const styleTex = (t: string) => {
  const parts: string[] = [];
  let last = 0;
  for (const m of t.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g)) {
    parts.push(escTex(t.slice(last, m.index)));
    parts.push(m[1] !== undefined ? `\\texttt{${escTex(m[1])}}` : m[2] !== undefined ? `\\textbf{${escTex(m[2])}}` : `\\emph{${escTex(m[3])}}`);
    last = m.index + m[0].length;
  }
  parts.push(escTex(t.slice(last)));
  return parts.join('');
};
export function textTex(text: string): string {
  return text.split(/\n\s*\n/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `\\begin{itemize}\n${lines.map((l) => `  \\item ${inlineTex(l.replace(/^\s*[-*]\s+/, ''))}`).join('\n')}\n\\end{itemize}`;
    return inlineTex(lines.join(' '));
  }).join('\n\n');
}
const inlineTex = (s: string) => inlineParts(s).map((p) => (p.math !== undefined ? (p.display ? `\\[ ${p.math} \\]` : `$${p.math}$`) : styleTex(p.text ?? ''))).join('');

// ——— The report ———

/** Output text as HTML: typeset results (\u0001 LaTeX \u0002 plain \u0003) through `math`, the rest escaped. */
function outputHtml(text: string, math: (tex: string, display: boolean) => string): string {
  return text.split(/(\u0001[^\u0002]*\u0002[^\u0003]*\u0003)/).map((part) => {
    const m = /^\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003$/.exec(part);
    return m ? math(m[1], true) : escHtml(part);
  }).join('');
}
const svgData = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A whole report page: sections, text, code, what it printed and its figures (light), ready to open or print. */
export function reportHtml(title: string, sections: Section[], outs: (SectionOut | undefined)[], math: (tex: string, display: boolean) => string, when: string): string {
  const body = sections.map((s, i) => {
    const o = outs[i];
    const blocks = s.blocks.map((b) => (b.kind === 'text' ? textHtml(b.text, math) : `<pre class="code"><code>${escHtml(b.code)}</code></pre>`)).join('\n');
    const printed = o?.text.trim() ? `<pre class="out">${outputHtml(o.text.replace(/\n{3,}/g, '\n\n').trim(), math)}</pre>` : '';
    const err = o?.error ? `<pre class="err">${escHtml(o.error)}</pre>` : '';
    const figs = (o?.figs ?? []).map((f) => `<figure><img alt="Figure ${f.id}" src="${svgData(f.light)}"></figure>`).join('');
    return `<section>${s.title ? `<h2>${escHtml(s.title)}</h2>` : ''}\n${blocks}\n${printed}${err}${figs}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<style>
body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#18181b;background:#fff;max-width:820px;margin:40px auto;padding:0 20px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:36px 0 8px;border-bottom:1px solid #e4e4e7;padding-bottom:4px}
.when{color:#52525b;font-size:13px;margin-bottom:24px}
pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:10px 12px;border-radius:8px;overflow-x:auto;white-space:pre-wrap}
pre.code{background:#f4f4f5}pre.out{background:#fff;border:1px solid #e4e4e7}pre.err{background:#fef2f2;color:#b91c1c}
code{font:0.9em ui-monospace,Menlo,monospace;background:#f4f4f5;padding:1px 4px;border-radius:4px}pre code{background:none;padding:0}
figure{margin:12px 0}figure img{max-width:100%;height:auto;border:1px solid #e4e4e7;border-radius:8px}
.nb-display{margin:8px 0;overflow-x:auto}math{font-size:1.1em}
@media print{body{margin:0}h2{break-after:avoid}figure,pre{break-inside:avoid}}
</style></head><body>
<h1>${escHtml(title)}</h1><div class="when">Made with Hyperion · ${escHtml(when)}</div>
${body}
</body></html>
`;
}

/** The same report as a LaTeX document (pdflatex; figures need pgfplots). */
export function reportTex(title: string, sections: Section[], outs: (SectionOut | undefined)[]): string {
  const body = sections.map((s, i) => {
    const o = outs[i];
    const blocks = s.blocks.map((b) => (b.kind === 'text' ? textTex(b.text) : `\\begin{lstlisting}\n${b.code}\n\\end{lstlisting}`)).join('\n\n');
    // Printed text in verbatim blocks; typeset results as display maths between them.
    const out = (o?.text.trim() ? o.text.replace(/\n{3,}/g, '\n\n').trim().split(/(\u0001[^\u0002]*\u0002[^\u0003]*\u0003)/) : []).map((part) => {
      const m = /^\u0001([^\u0002]*)\u0002([^\u0003]*)\u0003$/.exec(part);
      if (m) return `\\[ ${m[1]} \\]`;
      return part.trim() ? `\\begin{verbatim}\n${part.replace(/^\n+|\n+$/g, '')}\n\\end{verbatim}` : '';
    }).filter(Boolean).join('\n');
    const err = o?.error ? `\\begin{verbatim}\nError: ${o.error}\n\\end{verbatim}` : '';
    const figs = (o?.figs ?? []).map((f) => `\\begin{figure}[h]\n\\centering\n${f.tex}\n\\end{figure}`).join('\n');
    return `${s.title ? `\\section*{${escTex(s.title)}}\n` : ''}${blocks}\n${out}\n${err}\n${figs}`.replace(/\n{3,}/g, '\n\n');
  }).join('\n\n');
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{listings,xcolor}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\lstset{basicstyle=\\ttfamily\\small,columns=fullflexible,breaklines=true,backgroundcolor=\\color{black!4},frame=none}
\\title{${escTex(title)}}
\\date{\\today}
\\begin{document}
\\maketitle

${body}

\\end{document}
`;
}
