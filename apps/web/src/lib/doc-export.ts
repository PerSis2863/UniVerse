// Downloading a document (Stage 5 · B9.6) from the editor's own structure (Tiptap's JSON), so
// tables, checklists, links and mentions come out properly: Markdown, and a real Word file
// (.docx: WordprocessingML, zipped by the caller). Pictures go into the Word file when the caller
// could fetch them (as PNG); otherwise a "[Picture: …]" note stands in.

export interface PMMark { type: string; attrs?: Record<string, unknown> }
export interface PMNode { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] }
export interface DocxImage { data: Uint8Array; width: number; height: number }

const kids = (n: PMNode) => n.content ?? [];
const attr = <T>(n: PMNode | PMMark, k: string, d: T): T => ((n.attrs?.[k] as T | undefined) ?? d);

// ── Markdown ─────────────────────────────────────────────────────────────────────────────────

const mdEscape = (s: string) => s.replace(/([\\`*_[\]])/g, '\\$1');

/** Wraps text in markers, keeping its spaces outside them (Markdown needs that). */
function wrapMd(text: string, open: string, close = open) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : text;
}

function inlineMd(nodes: PMNode[]): string {
  return nodes.map((n) => {
    if (n.type === 'hardBreak') return '  \n';
    if (n.type === 'mention') return `@${attr(n, 'label', attr(n, 'id', 'someone'))}`;
    if (n.type === 'image') return `![${mdEscape(attr(n, 'alt', ''))}](${attr(n, 'src', '')})`;
    if (n.type !== 'text' || !n.text) return '';
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    if (has('code')) { const t = n.text.includes('`') ? `\`\` ${n.text} \`\`` : `\`${n.text}\``; const link = marks.find((m) => m.type === 'link'); return link ? `[${t}](${attr(link, 'href', '')})` : t; }
    let t = mdEscape(n.text);
    if (has('bold')) t = wrapMd(t, '**');
    if (has('italic')) t = wrapMd(t, '*');
    if (has('strike')) t = wrapMd(t, '~~');
    const link = marks.find((m) => m.type === 'link');
    if (link) t = `[${t}](${attr(link, 'href', '')})`;
    return t;
  }).join('');
}

const cellMd = (cell: PMNode) => kids(cell).map((p) => inlineMd(kids(p))).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function blockMd(n: PMNode, indent = ''): string {
  switch (n.type) {
    case 'paragraph': return indent + inlineMd(kids(n)).replace(/\n/g, `\n${indent}`);
    case 'heading': return `${'#'.repeat(Math.min(6, Math.max(1, attr(n, 'level', 1))))} ${inlineMd(kids(n))}`;
    case 'blockquote': return kids(n).map((c) => blockMd(c)).join('\n\n').split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
    case 'codeBlock': return `\`\`\`${attr(n, 'language', '') ?? ''}\n${kids(n).map((t) => t.text ?? '').join('')}\n\`\`\``;
    case 'horizontalRule': return '---';
    case 'image': return inlineMd([n]);
    case 'bulletList': case 'orderedList': case 'taskList': {
      let i = attr(n, 'start', 1);
      return kids(n).map((item) => {
        const marker = n.type === 'orderedList' ? `${i++}.` : n.type === 'taskList' ? `- [${attr(item, 'checked', false) ? 'x' : ' '}]` : '-';
        const [first, ...rest] = kids(item);
        const pad = `${indent}${' '.repeat(marker.length + 1)}`;
        const head = first ? blockMd(first, '').replace(/\n/g, `\n${pad}`) : '';
        const more = rest.map((c) => (c.type.endsWith('List') ? blockMd(c, pad) : `${pad}${blockMd(c, '')}`)).join('\n');
        return `${indent}${marker} ${head}${more ? `\n${more}` : ''}`;
      }).join('\n');
    }
    case 'table': {
      const rows = kids(n).map((r) => kids(r).map(cellMd));
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, k) => r[k] ?? '').join(' | ')} |`;
      return [line(rows[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
    }
    default: return kids(n).map((c) => blockMd(c, indent)).join('\n\n');
  }
}

/** The document as Markdown, with its title as the top heading. */
export function docToMarkdown(doc: PMNode, title?: string): string {
  const body = kids(doc).map((b) => blockMd(b)).filter((s) => s.trim() !== '').join('\n\n');
  return `${title ? `# ${title}\n\n` : ''}${body}\n`;
}

// ── Word (.docx) ─────────────────────────────────────────────────────────────────────────────

const xml = (s: string) => s.replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DRAW = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** The widest a picture goes: 6 inches, in EMUs. */
const MAX_EMU = 5_486_400;

interface Ctx { rels: string[]; nums: string[]; media: { name: string; data: Uint8Array }[]; images: Map<string, DocxImage>; origin: string; nextNum: number; nextId: number }

function rel(ctx: Ctx, type: string, target: string, external = false) {
  const id = `rId${ctx.rels.length + 10}`;
  ctx.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ''}/>`);
  return id;
}

function run(text: string, props = '') {
  const parts = text.split('\n');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(p)}</w:t>`).join('')}</w:r>`;
}

function picture(ctx: Ctx, src: string, alt: string) {
  const img = ctx.images.get(src);
  if (!img) return run(`[Picture${alt ? `: ${alt}` : ''}]`, '<w:i/><w:color w:val="71717A"/>');
  const name = `image${ctx.media.length + 1}.png`;
  ctx.media.push({ name, data: img.data });
  const id = rel(ctx, 'image', `media/${name}`);
  let cx = Math.round(img.width * 9525), cy = Math.round(img.height * 9525);
  if (cx > MAX_EMU) { cy = Math.round((cy * MAX_EMU) / cx); cx = MAX_EMU; }
  const n = ctx.nextId++;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${xml(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function inlineDocx(ctx: Ctx, nodes: PMNode[], extra = ''): string {
  return nodes.map((n) => {
    if (n.type === 'hardBreak') return '<w:r><w:br/></w:r>';
    if (n.type === 'mention') return run(`@${attr(n, 'label', attr(n, 'id', 'someone'))}`, `${extra}<w:b/><w:color w:val="4F46E5"/>`);
    if (n.type === 'image') return picture(ctx, attr(n, 'src', ''), attr(n, 'alt', ''));
    if (n.type !== 'text' || !n.text) return '';
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    const props = `${extra}${has('bold') ? '<w:b/>' : ''}${has('italic') ? '<w:i/>' : ''}${has('underline') ? '<w:u w:val="single"/>' : ''}${has('strike') ? '<w:strike/>' : ''}${has('code') ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F4F4F5"/>' : ''}`;
    const link = marks.find((m) => m.type === 'link');
    const href = link ? attr(link, 'href', '') : '';
    const target = /^(https?:|mailto:)/i.test(href) ? href : href.startsWith('/') ? `${ctx.origin}${href}` : '';
    if (target) return `<w:hyperlink r:id="${rel(ctx, 'hyperlink', target, true)}">${run(n.text, `<w:rStyle w:val="Hyperlink"/>${props}`)}</w:hyperlink>`;
    return run(n.text, props);
  }).join('');
}

const para = (pPr: string, inner: string) => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;

function blocksDocx(ctx: Ctx, nodes: PMNode[], opts: { style?: string; level?: number; num?: number; extra?: string } = {}): string {
  return nodes.map((n) => {
    const style = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '';
    switch (n.type) {
      case 'paragraph': return para(style, inlineDocx(ctx, kids(n), opts.extra));
      case 'heading': return para(`<w:pStyle w:val="Heading${Math.min(3, Math.max(1, attr(n, 'level', 1)))}"/>`, inlineDocx(ctx, kids(n)));
      case 'blockquote': return blocksDocx(ctx, kids(n), { ...opts, style: 'Quote' });
      case 'codeBlock': return para('<w:pStyle w:val="Code"/>', run(kids(n).map((t) => t.text ?? '').join('')));
      case 'horizontalRule': return para('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D4D4D8"/></w:pBdr>', '');
      case 'image': return para('', picture(ctx, attr(n, 'src', ''), attr(n, 'alt', '')));
      case 'bulletList': case 'orderedList': case 'taskList': {
        const level = opts.level === undefined ? 0 : opts.level + 1;
        let num = 1;
        if (n.type === 'orderedList') {
          num = ctx.nextNum++;
          ctx.nums.push(`<w:num w:numId="${num}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${attr(n, 'start', 1)}"/></w:lvlOverride></w:num>`);
        }
        return kids(n).map((item) => kids(item).map((c, k) => {
          if (c.type.endsWith('List')) return blocksDocx(ctx, [c], { level, num });
          const first = k === 0;
          if (n.type === 'taskList') {
            const box = first ? run(attr(item, 'checked', false) ? '☑ ' : '☐ ') : '';
            return para(`<w:ind w:left="${360 + level * 360}"/>`, box + (c.type === 'paragraph' ? inlineDocx(ctx, kids(c)) : ''));
          }
          if (c.type !== 'paragraph') return blocksDocx(ctx, [c], opts);
          return para(first ? `<w:numPr><w:ilvl w:val="${Math.min(8, level)}"/><w:numId w:val="${n.type === 'orderedList' ? num : 1}"/></w:numPr>` : `<w:ind w:left="${720 + level * 360}"/>`, inlineDocx(ctx, kids(c)));
        }).join('')).join('');
      }
      case 'table': {
        const rows = kids(n);
        const width = Math.max(1, ...rows.map((r) => kids(r).length));
        const col = Math.floor(9026 / width);
        const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D4D4D8"/>`;
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: width }, () => `<w:gridCol w:w="${col}"/>`).join('')}</w:tblGrid>${rows.map((r) => `<w:tr>${kids(r).map((cell) => {
          const inner = blocksDocx(ctx, kids(cell), { extra: cell.type === 'tableHeader' ? '<w:b/>' : '' });
          return `<w:tc><w:tcPr><w:tcW w:w="${col}" w:type="dxa"/>${cell.type === 'tableHeader' ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F5"/>' : ''}</w:tcPr>${inner || '<w:p/>'}</w:tc>`;
        }).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
      }
      default: return blocksDocx(ctx, kids(n), opts);
    }
  }).join('');
}

const STYLES = `${HEAD}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>'
  + [['1', 36, 360], ['2', 30, 280], ['3', 26, 240]].map(([l, sz, before]) => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${Number(l) - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`).join('')
  + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="818CF8"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="52525B"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F5"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
  + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="4F46E5"/><w:u w:val="single"/></w:rPr></w:style>'
  + '</w:styles>';

const lvls = (bullet: boolean) => Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${bullet ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][i % 3]}"/><w:lvlText w:val="${bullet ? ['•', '◦', '▪'][i % 3] : `%${i + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr></w:lvl>`).join('');

/** The files inside a .docx (paths → contents) for a document; zip them to make the file. */
export function docToDocx(doc: PMNode, title: string, opts: { images?: Map<string, DocxImage>; origin?: string } = {}): Record<string, string | Uint8Array> {
  const ctx: Ctx = { rels: [], nums: [], media: [], images: opts.images ?? new Map(), origin: opts.origin ?? '', nextNum: 2, nextId: 1 };
  const body = (title ? para('<w:pStyle w:val="Title"/>', run(title)) : '') + blocksDocx(ctx, kids(doc));
  const files: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    '_rels/.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `${HEAD}<w:document ${W} ${DRAW}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    'word/styles.xml': STYLES,
    'word/numbering.xml': `${HEAD}<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(true)}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(false)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${ctx.nums.join('')}</w:numbering>`,
    'word/_rels/document.xml.rels': `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${ctx.rels.join('')}</Relationships>`,
  };
  for (const m of ctx.media) files[`word/media/${m.name}`] = m.data;
  return files;
}

/** Every picture address in a document (to fetch before making the Word file). */
export function imageSources(doc: PMNode): string[] {
  const out = new Set<string>();
  const walk = (n: PMNode) => { if (n.type === 'image' && typeof n.attrs?.src === 'string') out.add(n.attrs.src); kids(n).forEach(walk); };
  walk(doc);
  return [...out];
}
