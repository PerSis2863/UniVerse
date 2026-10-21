// Code 128 barcodes (Stage 5 · Q22, B15.4: library labels and cards), the kind every handheld and
// phone scanner reads. Set B covers printable ASCII (letters, digits, punctuation, spaces); the text
// gets a start code, a checksum and a stop code. Returns the bar and space widths in modules,
// starting with a bar; draw them as an SVG (src/components/ui/Barcode.tsx). Pure and unit-tested.

// The 107 patterns (103 values, 3 start codes, stop), each as six widths (bar, space, bar, space, bar, space; stop has seven).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104, STOP = 106;

/** Whether the text can be a Code 128 (set B) barcode: printable ASCII, 1 to 60 characters. */
export const canEncode128 = (text: string) => text.length > 0 && text.length <= 60 && /^[\x20-\x7e]+$/.test(text);

/** The barcode's values: start B, each character, the checksum, stop. */
export function code128Values(text: string): number[] {
  if (!canEncode128(text)) throw new Error('A barcode can hold letters, digits and punctuation, up to 60.');
  const values = [START_B, ...[...text].map((c) => c.charCodeAt(0) - 32)];
  const check = values.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
  return [...values, check, STOP];
}

/** Bar and space widths in modules, bar first, with the closing bar of the stop code. */
export function code128(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]].map(Number));
}

const xmlEsc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The barcode as an SVG string (for printed labels): black bars on white, with the quiet zone scanners need. */
export function code128Svg(text: string, o: { height?: number; module?: number } = {}): string {
  const w = code128(text), m = o.module ?? 2, h = o.height ?? 50, quiet = 10;
  let x = quiet * m, bars = '';
  w.forEach((width, i) => { if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width * m}" height="${h}"/>`; x += width * m; });
  const total = x + quiet * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" width="${total}" height="${h}" role="img" aria-label="Barcode ${xmlEsc(text)}" shape-rendering="crispEdges"><rect width="${total}" height="${h}" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
}
