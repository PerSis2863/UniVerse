import type { ReactNode } from 'react';

// Renders the legal documents (legal/*.md) as part of the page. Covers the Markdown they use:
// headings, paragraphs, bullet and numbered lists, tables, rules, **bold**, *italic* and links.

export type Heading = { id: string; title: string };

const slug = (s: string) => s.toLowerCase().replace(/[*_`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** **bold**, *italic*, [text](url) and `code` inside a line. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = out.length;
    if (m[1] !== undefined) out.push(<strong key={k} className="font-semibold text-white">{inline(m[1])}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2])}</em>);
    else if (m[3] !== undefined) {
      const href = m[4];
      const safe = /^(https?:|mailto:|\/|#)/.test(href) ? href : '#';
      out.push(<a key={k} href={safe} className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline break-words" {...(safe.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>{m[3]}</a>);
    } else out.push(<code key={k} className="px-1 py-0.5 rounded bg-white/10 text-[0.9em]">{m[5]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/**
 * Splits a document into its title, "Last Updated" date and body, so the page can show the title
 * and date in its own header.
 */
export function parseLegal(md: string) {
  const lines = md.replace(/\r/g, '').split('\n');
  let title = '';
  let updated = '';
  const body: string[] = [];
  for (const line of lines) {
    if (!title && /^# /.test(line)) { title = line.slice(2).trim(); continue; }
    const u = !updated && line.match(/^\*\*Last Updated:\s*(.+?)\*\*\s*$/i);
    if (u) { updated = u[1]; continue; }
    body.push(line);
  }
  const headings: Heading[] = body.filter((l) => /^## /.test(l)).map((l) => { const t = l.slice(3).trim(); return { id: slug(t), title: t.replace(/\*/g, '') }; });
  return { title, updated, body: body.join('\n'), headings };
}

export function LegalMarkdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = blocks.length;
    if (!line.trim()) { i++; continue; }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={k} className="border-white/10" />); i++; continue; }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const text = h[2].trim();
      if (h[1].length === 2) blocks.push(<h2 key={k} id={slug(text)} className="scroll-mt-28 pt-4 text-xl sm:text-2xl font-bold text-white">{inline(text)}</h2>);
      else blocks.push(<h3 key={k} className="pt-1 text-base sm:text-lg font-semibold text-white">{inline(text)}</h3>);
      i++;
      continue;
    }
    if (/^\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const [head, , ...rest] = rows;
      blocks.push(
        <div key={k} className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-white/[0.04] text-white">
              <tr>{cells(head).map((c, j) => <th key={j} className="px-4 py-3 font-semibold">{inline(c)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rest.map((r, j) => <tr key={j}>{cells(r).map((c, n) => <td key={n} className="px-4 py-3 align-top">{inline(c)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k} className={`space-y-2 pl-5 ${ordered ? 'list-decimal marker:text-indigo-400 marker:font-semibold' : 'list-disc marker:text-indigo-400'}`}>
          {items.map((it, j) => <li key={j} className="pl-1">{inline(it)}</li>)}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|\||---+\s*$)/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(<p key={k}>{inline(para.join(' '))}</p>);
  }
  return <div className="space-y-4 text-[15px] leading-relaxed text-zinc-300">{blocks}</div>;
}
