// The words inside a file, taken out in the browser when it's uploaded to the files hub (Stage 5 ·
// B9.13), so search can find files by what they say. Nothing is sent but the words (at most
// 20,000 characters); files it can't read just aren't searchable by their contents.

const LIMIT = 20_000;
const TEXT = /\.(txt|csv|tsv|md|json|srt|vtt)$/i;

export async function extractText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  try {
    if (file.size > 40 * 1024 * 1024) return null;
    if (TEXT.test(name) || file.type.startsWith('text/')) return (await file.slice(0, LIMIT * 4).text()).slice(0, LIMIT);
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { openPdfData } = await import('@/lib/pdf');
      const doc = await openPdfData(await file.arrayBuffer());
      let out = '';
      for (let i = 1; i <= Math.min(doc.numPages, 60) && out.length < LIMIT; i++) {
        const pg = await doc.getPage(i);
        const tc = await pg.getTextContent();
        out += tc.items.map((it) => ('str' in it ? `${it.str}${it.hasEOL ? '\n' : ' '}` : '')).join('') + '\n';
        pg.cleanup();
      }
      void doc.destroy();
      return out.trim().slice(0, LIMIT) || null;
    }
    if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.trim().slice(0, LIMIT) || null;
    }
    if (name.endsWith('.xlsx')) {
      const { default: read } = await import('read-excel-file/browser');
      const sheets = await read(file);
      return sheets.flatMap((s) => (s.data as unknown[][]).map((row) => row.filter((c) => c !== null && c !== undefined).join(' '))).join('\n').slice(0, LIMIT) || null;
    }
  } catch { /* not readable: searchable by name only */ }
  return null;
}
