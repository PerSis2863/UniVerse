// M337: the Terms and the Privacy Policy as PDFs (public/legal), made from the same Markdown as /terms and /privacy
// (legal/*.md), so the download never falls behind the page. Run from apps/web after editing either file:
//   node scripts/legal-pdf.mjs
import { readFileSync } from 'node:fs';
import { launch } from './browser-session.mjs';

const DOCS = [['legal/terms.md', 'public/legal/UniVerse-Terms-and-Conditions.pdf', 'UniVerse Terms and Conditions'], ['legal/privacy.md', 'public/legal/UniVerse-Privacy-Policy.pdf', 'UniVerse Privacy Policy']];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;br&gt;/g, '<br>');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
  .replace(/\b([\w.+-]+@[\w-]+\.[\w.]+)\b/g, '<a href="mailto:$1">$1</a>');

/** The few Markdown shapes these two files use: headings, paragraphs, lists, tables, rules. */
function html(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const h = l.match(/^(#{1,3}) (.*)/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^---+$/.test(l.trim())) { out.push('<hr>'); continue; }
    if (/^\s*([-*]|\d+\.) /.test(l)) {
      const tag = /^\s*\d+\./.test(l) ? 'ol' : 'ul';
      const items = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i]); i++) items.push(`<li>${inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))}</li>`);
      i--; out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) if (!/^\|[\s|:-]+\|$/.test(lines[i])) rows.push(lines[i].slice(1, -1).split('|').map((c) => inline(c.trim())));
      i--; out.push(`<table><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(#|\||---|\s*([-*]|\d+\.) )/.test(lines[i]); i++) para.push(lines[i]);
    i--; out.push(`<p>${inline(para.join(' ')).replace(/<br> /g, '<br>')}</p>`);
  }
  return out.join('\n');
}

const CSS = `body{font:14px/1.6 Helvetica,Arial,sans-serif;color:#1f2328;margin:0}h1{font-size:30px;margin:0 0 12px}h2{font-size:19px;margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid #d8dee4}h3{font-size:15px;margin:18px 0 6px}
h1+p strong{color:#57606a}p,li{margin:0 0 8px}ul,ol{padding-inline-start:24px}hr{border:0;border-top:1px solid #d8dee4;margin:20px 0}a{color:#4f46e5;text-decoration:none}table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:12.5px}th,td{border:1px solid #d8dee4;padding:6px 8px;text-align:start;vertical-align:top}th{background:#f6f8fa}h2,h3{break-after:avoid}tr,li{break-inside:avoid}`;

const browser = await launch();
const page = await browser.newPage();
for (const [src, dest, title] of DOCS) {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${html(readFileSync(src, 'utf8'))}</body></html>`);
  const small = 'font:9px Helvetica,Arial,sans-serif;color:#57606a;width:100%;padding:0 54px;display:flex;justify-content:space-between';
  await page.pdf({
    path: dest, format: 'A4', printBackground: true, margin: { top: '64px', bottom: '64px', left: '64px', right: '64px' }, displayHeaderFooter: true,
    headerTemplate: `<div style="${small}"><span>${title}</span></div>`,
    footerTemplate: `<div style="${small}"><span>universeimpact.com</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  console.log('wrote', dest);
}
await browser.close();
