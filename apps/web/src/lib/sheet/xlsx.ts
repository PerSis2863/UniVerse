import { find, findAll, kid, kids, parseXml, type XmlNode } from '../xml-lite';
import { cleanBook, cleanSheetName, MAX_CELLS, MAX_SHEETS, type BookJSON, type CellJSON, type SheetJSON } from './book';
import { codeOf, type Style } from './format';
import { isFormula, shiftFormula, tokenize } from './formula';
import { MAX_COLS, MAX_ROWS, cellOf, colName, keyOf, parseAddr } from './refs';
import { isErr, readInput, type V } from './values';

// Excel files (.xlsx) for spreadsheets (Stage 5 · Office suite), read and written here without a
// library: each sheet's values and formulas (shared formulas too), number formats, bold / italic /
// underline / strikethrough, font size, colours, fill, borders, alignment and wrapping, column
// widths, row heights, merged cells, frozen panes and hidden rows. Charts, pictures, comments and
// macros aren't read. The caller unzips and zips (fflate). Tested in xlsx.test.ts.

const dec = new TextDecoder();
const enc = new TextEncoder();
const MAX_SHEET_XML = 5_000_000;

// Excel's built-in number formats.
const BUILTIN: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'hh:mm', 21: 'hh:mm:ss', 22: 'yyyy-mm-dd hh:mm',
  37: '#,##0;(#,##0)', 38: '#,##0;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};

/** A style's number format from an Excel format code: the simple ones by name, others as they are. */
function fmtFromCode(code: string): Partial<Style> {
  const c = code.trim();
  if (!c || /^general$/i.test(c)) return {};
  if (c === '@') return { fmt: 'text' };
  let m = /^#,##0(?:\.(0+))?$/.exec(c);
  if (m) return { fmt: 'number', dp: m[1]?.length ?? 0 };
  m = /^0(?:\.(0+))?%$/.exec(c);
  if (m) return { fmt: 'percent', dp: m[1]?.length ?? 0 };
  m = /^0(?:\.(0+))?E\+00$/i.exec(c);
  if (m) return { fmt: 'scientific', dp: m[1]?.length ?? 0 };
  m = /^"?([$€£₹¥])"?#,##0(?:\.(0+))?(?:;.*)?$/.exec(c.replace(/\[\$([$€£₹¥])[^\]]*\]/g, '$1'));
  if (m) return { fmt: 'currency', cur: m[1], dp: m[2]?.length ?? 0 };
  const plain = c.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  if (/[dy]/i.test(plain) && /[hs]/i.test(plain)) return { fmt: 'datetime' };
  if (/^[dmy\s\-/.,]+$/i.test(plain)) return /^(yyyy-mm-dd|d mmm yyyy)$/i.test(c) ? { fmt: 'date' } : { fmt: 'custom', code: c.slice(0, 80) };
  if (/^[hms:\s]+(AM\/PM)?$/i.test(plain)) return { fmt: 'time' };
  return { fmt: 'custom', code: c.slice(0, 80) };
}
const color = (n: XmlNode | undefined) => { const rgb = n?.attrs.rgb; return rgb && /^[0-9a-f]{8}$/i.test(rgb) ? `#${rgb.slice(2).toLowerCase()}` : rgb && /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb.toLowerCase()}` : undefined; };
const on = (n: XmlNode | undefined) => !!n && n.attrs.val !== '0' && n.attrs.val !== 'false' && n.attrs.val !== 'none';

function readStyles(xml: string | null): Style[] {
  if (!xml) return [];
  const root = parseXml(xml);
  const codes = new Map<number, string>(Object.entries(BUILTIN).map(([k, v]) => [Number(k), v]));
  for (const f of findAll(kid(root, 'numFmts'), 'numFmt')) codes.set(Number(f.attrs.numFmtId), f.attrs.formatCode ?? '');
  const fonts = kids(kid(root, 'fonts'), 'font').map((f): Partial<Style> => {
    const sz = Number(kid(f, 'sz')?.attrs.val);
    const c = color(kid(f, 'color'));
    return { ...(on(kid(f, 'b')) ? { b: true } : {}), ...(on(kid(f, 'i')) ? { i: true } : {}), ...(kid(f, 'u') && kid(f, 'u')!.attrs.val !== 'none' ? { u: true } : {}), ...(on(kid(f, 'strike')) ? { st: true } : {}), ...(sz && sz !== 11 ? { size: Math.round(sz) } : {}), ...(c && c !== '#000000' ? { color: c } : {}) };
  });
  const fills = kids(kid(root, 'fills'), 'fill').map((f): Partial<Style> => { const p = kid(f, 'patternFill'); const c = p?.attrs.patternType === 'solid' ? color(kid(p, 'fgColor')) : undefined; return c ? { bg: c } : {}; });
  const borders = kids(kid(root, 'borders'), 'border').map((b): Partial<Style> => {
    const bd: NonNullable<Style['bd']> = {};
    for (const [k, n] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']] as const) { const x = kid(b, n); if (x?.attrs.style && x.attrs.style !== 'none') bd[k] = 1; }
    return Object.keys(bd).length ? { bd } : {};
  });
  return kids(kid(root, 'cellXfs'), 'xf').map((x) => {
    const al = kid(x, 'alignment');
    const h = al?.attrs.horizontal, v = al?.attrs.vertical;
    return {
      ...fmtFromCode(codes.get(Number(x.attrs.numFmtId ?? 0)) ?? ''),
      ...fonts[Number(x.attrs.fontId ?? 0)], ...fills[Number(x.attrs.fillId ?? 0)], ...borders[Number(x.attrs.borderId ?? 0)],
      ...(h === 'left' || h === 'center' || h === 'right' ? { align: h } : h === 'centerContinuous' ? { align: 'center' as const } : {}),
      ...(v === 'top' ? { va: 'top' as const } : v === 'center' ? { va: 'middle' as const } : {}),
      ...(al?.attrs.wrapText === '1' || al?.attrs.wrapText === 'true' ? { wrap: true } : {}),
    } as Style;
  });
}

/** What a cell holds as typed text: text that would read as something else keeps a leading '. */
function asTyped(text: string): string {
  if (!text) return '';
  return isFormula(text) || typeof readInput(text).v !== 'string' || text.startsWith("'") ? `'${text}` : text;
}

/** A workbook from an Excel file's parts (path → bytes, as fflate unzips them). */
export function readXlsx(files: Record<string, Uint8Array>): BookJSON & { skipped: string[] } {
  const byPath = new Map(Object.entries(files).map(([k, v]) => [k.replace(/^\/+/, '').toLowerCase(), v]));
  const read = (p: string) => { const f = byPath.get(p.toLowerCase()); return f ? dec.decode(f) : null; };
  const wb = read('xl/workbook.xml');
  if (!wb) throw new Error('This isn’t an Excel workbook (.xlsx).');
  const rels = new Map(findAll(parseXml(read('xl/_rels/workbook.xml.rels') ?? '<Relationships/>'), 'Relationship').map((r) => [r.attrs.Id, r.attrs.Target ?? '']));
  const strings = (() => {
    const x = read('xl/sharedStrings.xml');
    if (!x) return [];
    return kids(parseXml(x), 'si').map((si) => [...kids(si, 't'), ...kids(si, 'r').flatMap((r) => kids(r, 't'))].map((t) => t.text).join(''));
  })();
  const styles = readStyles(read('xl/styles.xml'));
  const skipped: string[] = [];
  const sheets: SheetJSON[] = [];
  let total = 0;
  for (const [i, s] of findAll(parseXml(wb), 'sheet').slice(0, MAX_SHEETS).entries()) {
    const target = (rels.get(s.attrs.id) ?? '').replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = target ? read(`xl/${target}`) : null;
    const name = cleanSheetName(s.attrs.name, `Sheet${i + 1}`);
    if (!xml) { skipped.push(`“${name}” (a chart sheet or missing)`); continue; }
    if (xml.length > MAX_SHEET_XML) { skipped.push(`“${name}” (too big: split it into smaller sheets)`); continue; }
    const root = parseXml(xml);
    const cells: Record<string, CellJSON> = {};
    const shared = new Map<string, { f: string; r: number; c: number }>();
    const rows: Record<string, number> = {}, cols: Record<string, number> = {};
    const hiddenRows: number[] = [];
    let cut = false;
    for (const row of findAll(kid(root, 'sheetData'), 'row')) {
      const rIndex = Number(row.attrs.r) - 1;
      if (row.attrs.customHeight === '1' && row.attrs.ht && rIndex >= 0 && rIndex < MAX_ROWS) rows[rIndex] = Math.round(Number(row.attrs.ht) * 4 / 3);
      if ((row.attrs.hidden === '1' || row.attrs.hidden === 'true') && rIndex >= 0) hiddenRows.push(rIndex);
      for (const c of kids(row, 'c')) {
        const at = parseAddr(c.attrs.r ?? '');
        if (!at) continue;
        if (total >= MAX_CELLS) { cut = true; break; }
        const style = styles[Number(c.attrs.s ?? 0)];
        const st = style && Object.keys(style).length ? style : undefined;
        const fNode = kid(c, 'f');
        const vText = kid(c, 'v')?.text ?? '';
        let raw = '';
        if (fNode) {
          let f = fNode.text.trim();
          if (fNode.attrs.t === 'shared' && fNode.attrs.si != null) {
            if (f) shared.set(fNode.attrs.si, { f, r: at.r, c: at.c });
            else { const m = shared.get(fNode.attrs.si); if (m) f = shiftFormula(m.f, at.r - m.r, at.c - m.c); }
          }
          if (f) raw = `=${f.replace(/_xlfn\.|_xlws\./g, '')}`;
        }
        if (!raw) {
          const t = c.attrs.t ?? 'n';
          if (t === 's') raw = asTyped(strings[Number(vText)] ?? '');
          else if (t === 'inlineStr') raw = asTyped(findAll(kid(c, 'is'), 't').map((x) => x.text).join(''));
          else if (t === 'str') raw = asTyped(vText);
          else if (t === 'b') raw = vText === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'e') raw = `'${vText}`;
          else if (t === 'd') raw = vText.slice(0, 10);
          else raw = vText;
        }
        if (!raw && !st) continue;
        const key = keyOf(at.r, at.c);
        cells[key] = st ? { v: raw, s: st } : { v: raw };
        total++;
      }
      if (cut) break;
    }
    if (cut) skipped.push(`the cells after the first ${MAX_CELLS.toLocaleString()} (a sheet this big can’t be edited together live)`);
    for (const col of findAll(kid(root, 'cols'), 'col')) {
      const lo = Number(col.attrs.min) - 1, hi = Math.min(Number(col.attrs.max) - 1, MAX_COLS - 1, lo + 300);
      const w = Number(col.attrs.width);
      if (Number.isFinite(w) && lo >= 0) for (let k = lo; k <= hi; k++) cols[k] = col.attrs.hidden === '1' ? 0 : Math.round(w * 7 + 5);
    }
    const sheet: SheetJSON = { id: `s${i + 1}`, name, cells, cols, rows, hiddenRows };
    const pane = find(kid(root, 'sheetViews'), 'pane');
    if (pane && (pane.attrs.state === 'frozen' || pane.attrs.state === 'frozenSplit')) sheet.freeze = { r: Math.round(Number(pane.attrs.ySplit ?? 0)), c: Math.round(Number(pane.attrs.xSplit ?? 0)) };
    sheet.merges = findAll(kid(root, 'mergeCells'), 'mergeCell').map((m) => m.attrs.ref ?? '').filter(Boolean);
    const tab = color(kid(kid(root, 'sheetPr'), 'tabColor'));
    if (tab) sheet.color = tab;
    sheets.push(sheet);
  }
  return { ...cleanBook({ sheets }), skipped };
}

// ── Writing ───────────────────────────────────────────────────────────────────────────────

/** Functions newer than Excel 2007 must be saved with "_xlfn." before them, or Excel (and
 *  LibreOffice) show #NAME?. */
const FUTURE = new Set(['IFS', 'SWITCH', 'XOR', 'IFNA', 'CONCAT', 'TEXTJOIN', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'DAYS', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'MODE.SNGL', 'RANK.EQ', 'PERCENTILE.INC', 'QUARTILE.INC', 'CEILING.MATH', 'FLOOR.MATH', 'UNICHAR', 'UNICODE']);
export function excelFormula(src: string): string {
  const toks = tokenize(src);
  if (!toks) return src;
  let out = '', at = 0;
  toks.forEach((t, i) => {
    const next = toks[i + 1];
    if (t.t === 'id' && next?.t === 'op' && next.v === '(' && FUTURE.has(t.v.toUpperCase())) { out += `${src.slice(at, t.at)}_xlfn.${t.v.toUpperCase()}`; at = t.end; }
  });
  return out + src.slice(at);
}

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

/** An Excel file's parts for a workbook (path → bytes, for fflate's zipSync). `valueOf` gives each
 *  formula's worked-out value, saved with it so other apps show it before recalculating. */
export function writeXlsx(book: BookJSON, valueOf?: (sheetId: string, key: string) => V): Record<string, Uint8Array> {
  const out: Record<string, string> = {};
  // Styles: one entry per different combination.
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const numFmts: string[] = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const xfIndex = new Map<string, number>([['{}', 0]]);
  const pick = (list: string[], x: string) => { let i = list.indexOf(x); if (i < 0) { list.push(x); i = list.length - 1; } return i; };
  const fmtIds = new Map<string, number>();
  const styleOf = (s: Style | undefined): number => {
    if (!s) return 0;
    const k = JSON.stringify(s);
    const have = xfIndex.get(k);
    if (have != null) return have;
    const font = `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.st ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.size ?? 11}"/>${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}<name val="${esc(s.font ?? 'Calibri')}"/></font>`;
    const fill = s.bg ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>` : fills[0];
    const b = s.bd ?? {};
    const side = (n: string, k: 't' | 'r' | 'b' | 'l') => (b[k] ? `<${n} style="thin"><color auto="1"/></${n}>` : `<${n}/>`);
    const border = `<border>${side('left', 'l')}${side('right', 'r')}${side('top', 't')}${side('bottom', 'b')}<diagonal/></border>`;
    let numFmtId = 0;
    const code = s.fmt === 'text' ? '@' : codeOf(s);
    if (code === '@') numFmtId = 49;
    else if (code) {
      const builtin = Object.entries(BUILTIN).find(([, v]) => v === code);
      if (builtin) numFmtId = Number(builtin[0]);
      else { numFmtId = fmtIds.get(code) ?? 164 + fmtIds.size; if (!fmtIds.has(code)) { fmtIds.set(code, numFmtId); numFmts.push(`<numFmt numFmtId="${numFmtId}" formatCode="${esc(code)}"/>`); } }
    }
    const h = s.align, v = s.va === 'middle' ? 'center' : s.va;
    const al = h || v || s.wrap ? `<alignment${h ? ` horizontal="${h}"` : ''}${v ? ` vertical="${v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xf = `<xf numFmtId="${numFmtId}" fontId="${pick(fonts, font)}" fillId="${pick(fills, fill)}" borderId="${pick(borders, border)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
    xfs.push(xf);
    xfIndex.set(k, xfs.length - 1);
    return xfs.length - 1;
  };

  const sheetXml = (s: SheetJSON) => {
    const byRow = new Map<number, { c: number; key: string; cell: CellJSON }[]>();
    for (const [key, cell] of Object.entries(s.cells)) {
      const at = cellOf(key);
      if (!at) continue;
      const list = byRow.get(at.r) ?? [];
      list.push({ c: at.c, key, cell });
      byRow.set(at.r, list);
    }
    const hidden = new Set(s.hiddenRows ?? []);
    const rowNums = [...new Set([...byRow.keys(), ...Object.keys(s.rows ?? {}).map(Number), ...hidden])].sort((a, b) => a - b);
    const rowsXml = rowNums.map((r) => {
      const ht = s.rows?.[r];
      const attrs = `${ht != null ? ` ht="${(ht * 3 / 4).toFixed(2)}" customHeight="1"` : ''}${hidden.has(r) ? ' hidden="1"' : ''}`;
      const cs = (byRow.get(r) ?? []).sort((a, b) => a.c - b.c).map(({ key, cell }) => {
        const st = styleOf(cell.s);
        const sAttr = st ? ` s="${st}"` : '';
        if (isFormula(cell.v)) {
          const v = valueOf?.(s.id, key);
          const f = `<f>${esc(excelFormula(cell.v.slice(1)))}</f>`;
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${key}"${sAttr}>${f}<v>${v}</v></c>`;
          if (typeof v === 'boolean') return `<c r="${key}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
          if (typeof v === 'string') return `<c r="${key}"${sAttr} t="str">${f}<v>${esc(v)}</v></c>`;
          if (isErr(v)) return `<c r="${key}"${sAttr} t="e">${f}<v>${esc(v.e)}</v></c>`;
          return `<c r="${key}"${sAttr}>${f}</c>`;
        }
        const { v } = readInput(cell.v);
        if (v === null) return `<c r="${key}"${sAttr}/>`;
        if (typeof v === 'number') return `<c r="${key}"${sAttr}><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${key}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
        return `<c r="${key}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}"${attrs}>${cs}</row>`;
    }).join('');
    const colEntries = Object.entries(s.cols ?? {}).map(([k, w]) => [Number(k), w] as const).sort((a, b) => a[0] - b[0]);
    const colsXml = colEntries.length ? `<cols>${colEntries.map(([k, w]) => `<col min="${k + 1}" max="${k + 1}" width="${Math.max(0, (w - 5) / 7).toFixed(2)}"${w === 0 ? ' hidden="1"' : ''} customWidth="1"/>`).join('')}</cols>` : '';
    const f = s.freeze;
    const pane = f && (f.r || f.c) ? `<pane${f.c ? ` xSplit="${f.c}"` : ''}${f.r ? ` ySplit="${f.r}"` : ''} topLeftCell="${colName(f.c)}${f.r + 1}" activePane="${f.r && f.c ? 'bottomRight' : f.r ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
    const merges = s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const tab = s.color ? `<sheetPr><tabColor rgb="${argb(s.color)}"/></sheetPr>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${tab}<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`;
  };

  book.sheets.forEach((s, i) => { out[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });
  out['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${book.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  out['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${book.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${book.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  out['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  out['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${book.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  out['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, enc.encode(v)]));
}

/** A sheet as CSV (what each cell shows), safe to open in other spreadsheet apps: text starting
 *  with = + - @ gets a leading ' so it isn't run as a formula there. */
export function sheetCsv(rows: string[][]): string {
  const cell = (x: string) => { let s = x; if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** CSV rows as a sheet's cells (each cell as typed). */
export function csvCells(rows: string[][]): Record<string, CellJSON> {
  const cells: Record<string, CellJSON> = {};
  let n = 0;
  for (let r = 0; r < Math.min(rows.length, MAX_ROWS); r++) for (let c = 0; c < Math.min(rows[r].length, MAX_COLS); c++) {
    const v = rows[r][c];
    if (!v || n >= MAX_CELLS) continue;
    // A CSV holds values: anything starting with = is kept as text, never run as a formula.
    cells[keyOf(r, c)] = { v: isFormula(v) ? `'${v}` : v };
    n++;
  }
  return cells;
}
