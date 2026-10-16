import { find, findAll, kid, kids, parseXml, type XmlNode } from '../xml-lite';
import { cleanDeck, H, newId, themeOf, widthOf, type DeckJSON, type Item, type Para, type Run, type ShapeKind, type Slide, type Transition } from './deck';
import { colorOf, fontOf } from './render';

// PowerPoint files (.pptx) for presentations (Office suite), written and read here without a
// library. Written: every slide with its background, text boxes (paragraphs, bullets, alignment,
// bold / italic / underline / strikethrough, colours, fonts, sizes, links), shapes, pictures,
// rotation, transitions and speaker notes. Read: the same, with layout placeholders' positions,
// groups flattened; pictures come back as "media:<path>" for the caller to upload. Animations,
// charts, tables, SmartArt and video aren't carried over. Tested in pptx.test.ts.

const enc = new TextEncoder();
const dec = new TextDecoder();
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const EMU_W = 12192000, EMU_H = 6858000;
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c: string) => c.replace('#', '').toUpperCase();
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const PRESET: Record<ShapeKind, string> = { rect: 'rect', round: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', arrow: 'rightArrow', star: 'star5', line: 'line' };
const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

function themeXml(name: string, dk: string, lt: string, accent: string, major: string, minor: string) {
  const solid = (v: string) => `<a:solidFill><a:schemeClr val="${v}"/></a:solidFill>`;
  return `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}">` +
    `<a:dk1><a:srgbClr val="${hex(dk)}"/></a:dk1><a:lt1><a:srgbClr val="${hex(lt)}"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
    `<a:accent1><a:srgbClr val="${hex(accent)}"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="${esc(name)}"><a:majorFont><a:latin typeface="${esc(major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="${esc(name)}"><a:fillStyleLst>${solid('phClr')}${solid('phClr')}${solid('phClr')}</a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="6350">${solid('phClr')}</a:ln><a:ln w="12700">${solid('phClr')}</a:ln><a:ln w="19050">${solid('phClr')}</a:ln></a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${solid('phClr')}${solid('phClr')}${solid('phClr')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

export interface Media { bytes: Uint8Array; ext: 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' }

/** A PowerPoint file's parts for a deck (path → bytes, for fflate's zipSync). `media` has each
 *  picture's bytes by its address (fetched by the caller); pictures without bytes are left out. */
export function writePptx(deck: DeckJSON, media: Map<string, Media> = new Map(), title = 'Presentation'): Record<string, Uint8Array> {
  const t = themeOf(deck.theme), W = widthOf(deck.ratio);
  const cx = deck.ratio === '4:3' ? 9144000 : EMU_W;
  const k = cx / W;
  const emu = (v: number) => Math.round(v * k);
  const out: Record<string, string | Uint8Array> = {};
  const mediaNames = new Map<string, string>();
  const slides = deck.slides;

  const runXml = (r: Run, size: number, color: string, font: string, rels: string[]) => {
    let link = '';
    if (r.link) { rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/hyperlink" Target="${esc(r.link)}" TargetMode="External"/>`); link = `<a:hlinkClick r:id="rId${rels.length}"/>`; }
    return `<a:r><a:rPr lang="en-US" sz="${Math.round(size * 0.6 * 100)}"${r.b ? ' b="1"' : ''}${r.i ? ' i="1"' : ''}${r.u ? ' u="sng"' : ''}${r.s ? ' strike="sngStrike"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${hex(r.color ?? color)}"/></a:solidFill><a:latin typeface="${esc(font)}"/>${link}</a:rPr><a:t>${esc(r.t)}</a:t></a:r>`;
  };
  const bodyXml = (it: Item, rels: string[]) => {
    const size = it.size ?? 32, color = colorOf(it, t), font = fontOf(it, t);
    let n = 0;
    const paras = (it.paras?.length ? it.paras : [{ runs: [] }]).map((p: Para) => {
      n = p.bullet === 'num' ? n + 1 : 0;
      const a = p.align ?? it.align;
      const lvl = p.level ?? 0;
      const ind = p.bullet ? ` marL="${342900 + lvl * 342900}" indent="-342900"` : lvl ? ` marL="${lvl * 342900}"` : '';
      const bu = p.bullet === 'dot' ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : p.bullet === 'num' ? '<a:buAutoNum type="arabicPeriod"/>' : '<a:buNone/>';
      return `<a:p><a:pPr${a && a !== 'left' ? ` algn="${a === 'center' ? 'ctr' : 'r'}"` : ''}${ind}>${bu}</a:pPr>${p.runs.map((r) => runXml(r, size, color, font, rels)).join('')}<a:endParaRPr lang="en-US" sz="${Math.round(size * 60)}" dirty="0"/></a:p>`;
    }).join('');
    const anchor = it.valign === 'middle' ? 'ctr' : it.valign === 'bottom' ? 'b' : it.kind === 'shape' ? 'ctr' : 't';
    return `<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${anchor}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
  };
  const xfrm = (it: Item) => `<a:xfrm${it.rot ? ` rot="${Math.round((((it.rot % 360) + 360) % 360) * 60000)}"` : ''}><a:off x="${emu(it.x)}" y="${emu(it.y)}"/><a:ext cx="${Math.max(1, emu(it.w))}" cy="${Math.max(1, emu(it.h))}"/></a:xfrm>`;

  slides.forEach((s: Slide, i) => {
    const n = i + 1;
    const rels: string[] = ['<Relationship Id="rId1" Type="' + REL + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>', `<Relationship Id="rId2" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`];
    let id = 2;
    const shapes = s.items.map((it) => {
      const name = it.role === 'title' ? 'Title' : it.kind === 'image' ? 'Picture' : it.kind === 'shape' ? 'Shape' : 'Text';
      if (it.kind === 'image') {
        const m = it.src ? media.get(it.src) : undefined;
        if (!m || !it.src) return '';
        let file = mediaNames.get(it.src);
        if (!file) { file = `image${mediaNames.size + 1}.${m.ext}`; mediaNames.set(it.src, file); out[`ppt/media/${file}`] = m.bytes; }
        rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/image" Target="../media/${file}"/>`);
        const fill = it.fit === 'contain' ? '<a:stretch><a:fillRect/></a:stretch>' : '<a:stretch><a:fillRect/></a:stretch>';
        return `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="${name} ${id}" descr="${esc(it.alt ?? '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${rels.length}"/>${fill}</p:blipFill><p:spPr>${xfrm(it)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
      }
      const shape = it.kind === 'shape';
      const geom = `<a:prstGeom prst="${shape ? PRESET[it.shape ?? 'rect'] : 'rect'}"><a:avLst/></a:prstGeom>`;
      const fill = shape && it.shape !== 'line' ? `<a:solidFill><a:srgbClr val="${hex(it.fill ?? t.accent)}"/></a:solidFill>` : '<a:noFill/>';
      const lineColor = it.line ?? (it.shape === 'line' ? t.text : null);
      const ln = lineColor ? `<a:ln w="${Math.round((it.lineW ?? (it.shape === 'line' ? 4 : 2)) * k)}"><a:solidFill><a:srgbClr val="${hex(lineColor)}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>';
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${name} ${id}"/><p:cNvSpPr${shape ? '' : ' txBox="1"'}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(it)}${geom}${fill}${ln}</p:spPr>${bodyXml(it, rels)}</p:sp>`;
    }).join('');
    const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(s.bg ?? t.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    const tr: Record<Exclude<Transition, 'none'>, string> = { fade: '<p:fade/>', slide: '<p:push dir="l"/>', zoom: '<p:zoom/>' };
    const transition = s.transition && s.transition !== 'none' ? `<p:transition spd="med">${tr[s.transition]}</p:transition>` : '';
    out[`ppt/slides/slide${n}.xml`] = `${HEAD}<p:sld ${NS}${s.hidden ? ' show="0"' : ''}><p:cSld>${bg}<p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transition}</p:sld>`;
    out[`ppt/slides/_rels/slide${n}.xml.rels`] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
    const notes = s.notes.split('\n').map((l) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(l)}</a:t></a:r></a:p>`).join('') || '<a:p><a:endParaRPr lang="en-US"/></a:p>';
    out[`ppt/notesSlides/notesSlide${n}.xml`] = `${HEAD}<p:notes ${NS}><p:cSld><p:spTree>${GROUP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${notes}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
    out[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/><Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${n}.xml"/></Relationships>`;
  });

  const presRels = [`<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`, `<Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>`, `<Relationship Id="rId3" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/>`,
    ...slides.map((_, i) => `<Relationship Id="rId${i + 4}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`)];
  out['ppt/presentation.xml'] = `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId3"/></p:notesMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 4}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${EMU_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  out['ppt/_rels/presentation.xml.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`;
  out['ppt/slideMasters/slideMaster1.xml'] = `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  out['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`;
  out['ppt/slideLayouts/slideLayout1.xml'] = `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  out['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
  out['ppt/notesMasters/notesMaster1.xml'] = `${HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
  out['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/theme" Target="../theme/theme2.xml"/></Relationships>`;
  out['ppt/theme/theme1.xml'] = themeXml(t.name, t.text, t.bg, t.accent, t.title, t.body);
  out['ppt/theme/theme2.xml'] = themeXml('Notes', '#000000', '#ffffff', '#4472c4', 'Calibri', 'Calibri');
  out['docProps/core.xml'] = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`;
  const types = ['png', 'jpeg', 'gif', 'webp', 'svg'].map((e) => `<Default Extension="${e}" ContentType="image/${e === 'svg' ? 'svg+xml' : e}"/>`).join('');
  const ov = (p: string, t2: string) => `<Override PartName="/${p}" ContentType="application/vnd.openxmlformats-officedocument.${t2}"/>`;
  out['[Content_Types].xml'] = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${types}` +
    ov('ppt/presentation.xml', 'presentationml.presentation.main+xml') + ov('ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster+xml') + ov('ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout+xml') +
    ov('ppt/notesMasters/notesMaster1.xml', 'presentationml.notesMaster+xml') + ov('ppt/theme/theme1.xml', 'theme+xml') + ov('ppt/theme/theme2.xml', 'theme+xml') +
    slides.map((_, i) => ov(`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide+xml') + ov(`ppt/notesSlides/notesSlide${i + 1}.xml`, 'presentationml.notesSlide+xml')).join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  out['_rels/.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  return Object.fromEntries(Object.entries(out).map(([p, v]) => [p, typeof v === 'string' ? enc.encode(v) : v]));
}

// ── Reading ────────────────────────────────────────────────────────────────────────────────

const PRESETS_BACK: Record<string, ShapeKind> = { rect: 'rect', roundRect: 'round', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', rightArrow: 'arrow', star5: 'star', line: 'line', flowChartProcess: 'rect', snip1Rect: 'rect' };
const TRANSITIONS: Record<string, Transition> = { fade: 'fade', dissolve: 'fade', push: 'slide', wipe: 'slide', cover: 'slide', pull: 'slide', zoom: 'zoom', split: 'fade' };

const resolve = (from: string, target: string) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
};
const relsPath = (p: string) => { const i = p.lastIndexOf('/'); return `${p.slice(0, i)}/_rels/${p.slice(i + 1)}.rels`; };
const color = (n: XmlNode | undefined) => { const c = kid(n, 'srgbClr')?.attrs.val; return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : undefined; };

interface Box { x: number; y: number; w: number; h: number; rot?: number }

/** A deck from a PowerPoint file's parts (path → bytes, as fflate unzips them). */
export function readPptx(files: Record<string, Uint8Array>): { deck: DeckJSON; skipped: string[] } {
  const byPath = new Map(Object.entries(files).map(([k, v]) => [k.replace(/^\/+/, '').toLowerCase(), v]));
  const read = (p: string) => { const f = byPath.get(p.toLowerCase()); return f ? dec.decode(f) : null; };
  const xml = (p: string) => { const t = read(p); return t ? parseXml(t) : null; };
  const relsOf = (p: string) => new Map(findAll(xml(relsPath(p)) ?? undefined, 'Relationship').map((r) => [r.attrs.Id, { target: resolve(p, r.attrs.Target ?? ''), type: (r.attrs.Type ?? '').split('/').pop() ?? '', external: r.attrs.TargetMode === 'External', raw: r.attrs.Target ?? '' }]));
  const pres = xml('ppt/presentation.xml');
  if (!pres) throw new Error('This isn’t a PowerPoint presentation (.pptx).');
  const size = kid(pres, 'sldSz');
  const cx = Number(size?.attrs.cx) || EMU_W, cy = Number(size?.attrs.cy) || EMU_H;
  const ratio: DeckJSON['ratio'] = Math.abs(cx / cy - 4 / 3) < 0.05 ? '4:3' : '16:9';
  const W = widthOf(ratio), sx = W / cx, sy = H / cy;
  const presRels = relsOf('ppt/presentation.xml');
  const skipped = new Set<string>();
  const slides: Slide[] = [];

  /** Placeholders of a layout or master, by type and index. */
  const placeholders = (p: string | undefined) => {
    const m = new Map<string, XmlNode>();
    const root = p ? xml(p) : null;
    for (const sp of findAll(root ?? undefined, 'sp')) {
      const ph = find(kid(sp, 'nvSpPr'), 'ph');
      if (!ph) continue;
      m.set(`t:${ph.attrs.type ?? 'body'}`, sp);
      if (ph.attrs.idx) m.set(`i:${ph.attrs.idx}`, sp);
    }
    return m;
  };

  for (const sid of findAll(kid(pres, 'sldIdLst'), 'sldId')) {
    if (slides.length >= 200) { skipped.add('slides after the 200th'); break; }
    const rel = presRels.get(sid.attrs.id);
    if (!rel) continue;
    const path = rel.target;
    const root = xml(path);
    if (!root) continue;
    const rels = relsOf(path);
    const layoutPath = [...rels.values()].find((r) => r.type === 'slideLayout')?.target;
    const masterPath = layoutPath ? [...relsOf(layoutPath).values()].find((r) => r.type === 'slideMaster')?.target : undefined;
    const fromLayout = placeholders(layoutPath), fromMaster = placeholders(masterPath);
    const items: Item[] = [];
    const inherited = (sp: XmlNode, name: 'xfrm') => {
      const ph = find(kid(sp, 'nvSpPr'), 'ph');
      if (!ph) return undefined;
      const keys = [ph.attrs.idx ? `i:${ph.attrs.idx}` : '', `t:${ph.attrs.type ?? 'body'}`, ph.attrs.type === 'ctrTitle' ? 't:title' : '', ph.attrs.type === 'subTitle' ? 't:body' : ''].filter(Boolean);
      for (const src of [fromLayout, fromMaster]) for (const k of keys) { const x = find(kid(src.get(k), 'spPr'), name); if (x) return x; }
      return undefined;
    };
    const boxOf = (x: XmlNode | undefined, g: (b: Box) => Box): Box | null => {
      const off = kid(x, 'off'), ext = kid(x, 'ext');
      if (!off || !ext) return null;
      const rot = Number(x?.attrs.rot ?? 0) / 60000;
      return g({ x: Number(off.attrs.x) || 0, y: Number(off.attrs.y) || 0, w: Number(ext.attrs.cx) || 0, h: Number(ext.attrs.cy) || 0, ...(rot ? { rot } : {}) });
    };
    const scale = (b: Box): Box => ({ x: Math.round(b.x * sx), y: Math.round(b.y * sy), w: Math.max(4, Math.round(b.w * sx)), h: Math.max(4, Math.round(b.h * sy)), ...(b.rot ? { rot: Math.round(b.rot) } : {}) });
    const parasOf = (body: XmlNode | undefined, phType: string | undefined): { paras: Para[]; size?: number; font?: string } => {
      let size: number | undefined, font: string | undefined;
      const paras: Para[] = [];
      for (const p of kids(body, 'p')) {
        const pPr = kid(p, 'pPr');
        const algn = pPr?.attrs.algn;
        const bullet: Para['bullet'] = kid(pPr, 'buAutoNum') ? 'num' : kid(pPr, 'buChar') ? 'dot' : kid(pPr, 'buNone') ? undefined : phType === 'body' || phType === 'obj' ? 'dot' : undefined;
        const lvl = Number(pPr?.attrs.lvl ?? 0);
        let runs: Run[] = [];
        const push = () => { paras.push({ runs, ...(bullet && runs.length ? { bullet } : {}), ...(algn === 'ctr' ? { align: 'center' as const } : algn === 'r' ? { align: 'right' as const } : {}), ...(lvl ? { level: Math.min(4, lvl) } : {}) }); runs = []; };
        for (const c of p.children) {
          if (c.name === 'br') { push(); continue; }
          if (c.name !== 'r' && c.name !== 'fld') continue;
          const rPr = kid(c, 'rPr');
          const t = kid(c, 't')?.text ?? '';
          if (!t) continue;
          const sz = Number(rPr?.attrs.sz);
          if (sz && !size) size = Math.round(sz / 100 / 0.6);
          const latin = kid(rPr, 'latin')?.attrs.typeface;
          if (latin && !font && !latin.startsWith('+')) font = latin;
          const col = color(kid(rPr, 'solidFill'));
          const link = kid(rPr, 'hlinkClick')?.attrs.id;
          const href = link ? rels.get(link) : undefined;
          runs.push({ t, ...(rPr?.attrs.b === '1' ? { b: true as const } : {}), ...(rPr?.attrs.i === '1' ? { i: true as const } : {}), ...(rPr?.attrs.u && rPr.attrs.u !== 'none' ? { u: true as const } : {}), ...(rPr?.attrs.strike && rPr.attrs.strike !== 'noStrike' ? { s: true as const } : {}), ...(col ? { color: col } : {}), ...(href?.external ? { link: href.raw } : {}) });
        }
        push();
      }
      while (paras.length && !paras[paras.length - 1].runs.length) paras.pop();
      return { paras, size, font };
    };
    const walk = (tree: XmlNode | undefined, g: (b: Box) => Box) => {
      for (const n of tree?.children ?? []) {
        if (items.length >= 60) { skipped.add('shapes after the 60th on a slide'); return; }
        if (n.name === 'grpSp') {
          const x = find(kid(n, 'grpSpPr'), 'xfrm');
          const off = kid(x, 'off'), ext = kid(x, 'ext'), chOff = kid(x, 'chOff'), chExt = kid(x, 'chExt');
          const kx = Number(chExt?.attrs.cx) ? Number(ext?.attrs.cx) / Number(chExt?.attrs.cx) : 1, ky = Number(chExt?.attrs.cy) ? Number(ext?.attrs.cy) / Number(chExt?.attrs.cy) : 1;
          const ox = Number(off?.attrs.x ?? 0) - Number(chOff?.attrs.x ?? 0) * kx, oy = Number(off?.attrs.y ?? 0) - Number(chOff?.attrs.y ?? 0) * ky;
          walk(n, (b) => g({ ...b, x: ox + b.x * kx, y: oy + b.y * ky, w: b.w * kx, h: b.h * ky }));
          continue;
        }
        if (n.name === 'sp' || n.name === 'cxnSp') {
          const spPr = kid(n, 'spPr');
          const ph = find(kid(n, 'nvSpPr'), 'ph');
          const phType = ph ? ph.attrs.type ?? 'body' : undefined;
          if (phType && ['dt', 'ftr', 'sldNum', 'sldImg'].includes(phType)) continue;
          const box = boxOf(find(spPr, 'xfrm') ?? inherited(n, 'xfrm'), g);
          if (!box) continue;
          const { paras, size, font } = parasOf(kid(n, 'txBody'), phType);
          const prst = find(spPr, 'prstGeom')?.attrs.prst;
          const fill = color(kid(spPr, 'solidFill'));
          const line = color(kid(kid(spPr, 'ln'), 'solidFill'));
          const anchor = find(kid(n, 'txBody'), 'bodyPr')?.attrs.anchor;
          const isShape = n.name === 'cxnSp' || (!!prst && (fill || prst !== 'rect') && !ph);
          if (!isShape && !paras.length) continue;
          const role: Item['role'] = phType === 'title' || phType === 'ctrTitle' ? 'title' : phType === 'subTitle' ? 'subtitle' : phType ? 'body' : undefined;
          const it: Item = { id: newId(), kind: isShape ? 'shape' : 'text', ...scale(box), ...(role ? { role } : {}), paras,
            size: size ?? (role === 'title' ? 73 : role === 'subtitle' ? 53 : role === 'body' ? 47 : 30),
            ...(font ? { font } : {}), ...(anchor === 'ctr' ? { valign: 'middle' as const } : anchor === 'b' ? { valign: 'bottom' as const } : {}) };
          if (isShape) { it.shape = n.name === 'cxnSp' ? 'line' : PRESETS_BACK[prst ?? 'rect'] ?? 'rect'; if (fill) it.fill = fill; if (line) { it.line = line; it.lineW = 2; } if (!PRESETS_BACK[prst ?? 'rect'] && n.name !== 'cxnSp') skipped.add(`a ${prst} shape (made a rectangle)`); }
          items.push(it);
          continue;
        }
        if (n.name === 'pic') {
          const box = boxOf(find(kid(n, 'spPr'), 'xfrm'), g);
          const embed = find(kid(n, 'blipFill'), 'blip')?.attrs.embed;
          const media = embed ? rels.get(embed) : undefined;
          if (!box || !media || media.external) continue;
          if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(media.target)) { skipped.add('pictures in a kind this app can’t show (like EMF)'); continue; }
          items.push({ id: newId(), kind: 'image', ...scale(box), src: `media:${media.target}`, alt: find(kid(n, 'nvPicPr'), 'cNvPr')?.attrs.descr ?? '', fit: 'cover' });
          continue;
        }
        if (n.name === 'graphicFrame') skipped.add('tables, charts and SmartArt');
      }
    };
    walk(find(kid(root, 'cSld'), 'spTree'), (b) => b);
    const bg = color(find(find(kid(root, 'cSld'), 'bg'), 'solidFill'));
    const trNode = kid(root, 'transition');
    const tr = trNode?.children.find((c) => TRANSITIONS[c.name]);
    const notesPath = [...rels.values()].find((r) => r.type === 'notesSlide')?.target;
    const notesRoot = notesPath ? xml(notesPath) : null;
    const notesSp = findAll(notesRoot ?? undefined, 'sp').find((sp) => { const ph = find(kid(sp, 'nvSpPr'), 'ph'); return ph && (ph.attrs.type ?? 'body') === 'body'; });
    const notes = kids(kid(notesSp, 'txBody'), 'p').map((p) => findAll(p, 't').map((t) => t.text).join('')).join('\n').trim();
    if (find(root, 'video') || find(root, 'audioFile')) skipped.add('video and sound');
    slides.push({ id: newId('s'), layout: 'blank', notes: notes.slice(0, 10_000), items, ...(bg ? { bg } : {}), ...(tr ? { transition: TRANSITIONS[tr.name] } : {}), ...(root.attrs.show === '0' ? { hidden: true } : {}) });
  }
  const deck = cleanDeck({ theme: 'classic', ratio, slides });
  // cleanDeck drops pictures it can't show; put the "media:" ones back for the caller to upload.
  deck.slides.forEach((s, i) => { s.items = slides[i] ? slides[i].items.filter((it) => it.kind !== 'image' || it.src).map((it) => { const c = s.items.find((x) => x.id === it.id); return c ? { ...c, ...(it.kind === 'image' ? { src: it.src } : {}) } : it; }) : s.items; });
  return { deck, skipped: [...skipped] };
}
