'use client';

// An offer letter as a PDF file (Stage 5 · Q22, B15.1): the school's name at the top, the date, the
// letter as written, the application's reference and the date to answer by, laid out on A4 by the
// converter's HTML → PDF step (src/components/docs/doc-to-pdf.ts), so any language prints right.
// Made on this device; nothing is sent anywhere.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function offerLetterPdf(o: { school: string; student: string; letter: string; ref?: string | null; expiresAt?: string | null; date?: Date }): Promise<Blob> {
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const paras = o.letter.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<h1 style="font-size:20pt;margin:0 0 4pt">${esc(o.school)}</h1>`
    + `<p style="color:#52525b;margin:0 0 18pt">Offer of a place${o.ref ? ` · Reference ${esc(o.ref)}` : ''} · ${esc(day(o.date ?? new Date()))}</p>`
    + paras
    + (o.expiresAt ? `<p style="margin-top:18pt"><strong>Please answer by ${esc(day(new Date(o.expiresAt)))}.</strong></p>` : '');
  const { documentToPdf } = await import('@/components/docs/doc-to-pdf');
  return documentToPdf(new File([html], 'offer.html', { type: 'text/html' }), html, `Offer letter · ${o.student}`);
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
