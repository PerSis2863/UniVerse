import type { Section, SectionOut } from './notebook';

// Jupyter notebooks in Hyperion (M561): an .ipynb opened in the Code window becomes a script of %% sections (Markdown
// cells as comment text, a heading as the section's title, each code cell its own section), so the notebook view runs
// it cell by cell; a script's notebook view saves back as .ipynb with each section's printed output and figures
// (SVG). Jupyter's own format (nbformat 4); its Octave kernel's name so Jupyter opens it with Octave if it has it.

type Cell = { cell_type: string; source: string | string[] };
const textOf = (s: string | string[] | undefined) => (Array.isArray(s) ? s.join('') : s ?? '');
const lines = (s: string) => { const xs = s.split('\n'); return xs.map((x, i) => (i < xs.length - 1 ? `${x}\n` : x)).filter((x, i, a) => x || i < a.length - 1); };

/** An .ipynb's text as a Hyperion script; throws on something that isn't a notebook. */
export function ipynbToScript(json: string): string {
  let nb: { cells?: Cell[] };
  try { nb = JSON.parse(json); } catch { throw new Error('this isn’t a Jupyter notebook (not JSON)'); }
  if (!Array.isArray(nb.cells)) throw new Error('this isn’t a Jupyter notebook (no cells)');
  const out: string[] = [];
  let open = false, lastCode = false;
  for (const c of nb.cells) {
    const text = textOf(c.source).replace(/\r/g, '').replace(/\n+$/, '');
    if (c.cell_type === 'markdown') {
      const rows = text.split('\n');
      const head = /^#{1,6}\s+(.+)$/.exec(rows[0] ?? '');
      if (head || !open || lastCode) { out.push(`%% ${head ? head[1].trim() : ''}`.trimEnd()); open = true; }
      for (const r of head ? rows.slice(1) : rows) out.push(r.trim() ? `% ${r}` : '%');
      lastCode = false;
    } else if (c.cell_type === 'code') {
      if (!open || lastCode) out.push('%%');
      open = true;
      out.push(text);
      lastCode = true;
    }
  }
  return `${out.join('\n').replace(/^%%\n/, '')}\n`;
}

/** A script's sections (and their outputs, when run) as an .ipynb's text. */
export function scriptToIpynb(sections: Section[], outs: (SectionOut | undefined)[] = []): string {
  const cells: object[] = [];
  let n = 0;
  sections.forEach((s, i) => {
    const md: string[] = [];
    if (s.title) md.push(`## ${s.title}`);
    const code: string[] = [];
    for (const b of s.blocks) {
      if (b.kind === 'text') { if (code.length) break; md.push(b.text); }
      else code.push(b.code);
    }
    // Text after code stays as a comment inside the code cell, so nothing is lost.
    const rest = s.blocks.slice(s.blocks.findIndex((b) => b.kind === 'code'));
    const body = s.blocks.some((b) => b.kind === 'code') ? rest.map((b) => (b.kind === 'code' ? b.code : b.text.split('\n').map((l) => `% ${l}`).join('\n'))).join('\n') : '';
    if (md.length) cells.push({ cell_type: 'markdown', metadata: {}, source: lines(md.join('\n\n')) });
    if (!body.trim()) return;
    const o = outs[i], outputs: object[] = [];
    if (o?.text) outputs.push({ output_type: 'stream', name: 'stdout', text: lines(o.text) });
    for (const f of o?.figs ?? []) outputs.push({ output_type: 'display_data', metadata: {}, data: { 'image/svg+xml': lines(f.light), 'text/plain': [`<Figure ${f.id}>`] } });
    if (o?.error) outputs.push({ output_type: 'error', ename: 'error', evalue: o.error, traceback: [o.error] });
    n += 1;
    cells.push({ cell_type: 'code', execution_count: o ? n : null, metadata: {}, outputs, source: lines(body) });
  });
  return `${JSON.stringify({
    cells,
    metadata: { kernelspec: { display_name: 'Octave', language: 'octave', name: 'octave' }, language_info: { name: 'octave', file_extension: '.m', mimetype: 'text/x-octave' } },
    nbformat: 4, nbformat_minor: 4,
  }, null, 1)}\n`;
}
