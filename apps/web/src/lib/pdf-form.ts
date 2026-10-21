// Filling in a PDF's form (Stage 5 · Q22, B9: form fields in the PDF editor). A PDF made as a form
// (AcroForm) has named fields: text boxes, tick boxes, lists and option buttons. The editor lists
// them, the person fills them in, and saving writes the answers into the fields and then onto the
// pages themselves ("flattened"), so they show in every viewer and survive the editor joining pages
// into a new file. Signature fields and buttons are left alone. Uses pdf-lib (loaded when needed).

export type FieldKind = 'text' | 'check' | 'choice' | 'radio';
export interface FormField { name: string; kind: FieldKind; value: string | boolean; options?: string[]; multiline?: boolean; readOnly?: boolean; maxLength?: number }
export type FormValues = Record<string, string | boolean>;

const MAX_FIELDS = 300;

/** The fields a PDF asks to be filled in (none for a PDF that isn't a form, or can't be read). */
export async function readForm(bytes: ArrayBuffer | Uint8Array): Promise<FormField[]> {
  const lib = await import('pdf-lib');
  try {
    const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const out: FormField[] = [];
    for (const f of doc.getForm().getFields().slice(0, MAX_FIELDS)) {
      const name = f.getName();
      const readOnly = f.isReadOnly();
      if (f instanceof lib.PDFTextField) out.push({ name, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline(), readOnly, maxLength: f.getMaxLength() });
      else if (f instanceof lib.PDFCheckBox) out.push({ name, kind: 'check', value: f.isChecked(), readOnly });
      else if (f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) out.push({ name, kind: 'choice', value: f.getSelected()[0] ?? '', options: f.getOptions(), readOnly });
      else if (f instanceof lib.PDFRadioGroup) out.push({ name, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions(), readOnly });
    }
    return out;
  } catch {
    return [];
  }
}

/** Only the answers that changed and fit their field (a choice must be one of its options). */
export function cleanValues(fields: FormField[], values: FormValues): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (f.readOnly || !(f.name in values)) continue;
    const v = values[f.name];
    if (f.kind === 'check') { if (typeof v === 'boolean' && v !== f.value) out[f.name] = v; continue; }
    if (typeof v !== 'string' || v === f.value) continue;
    if ((f.kind === 'choice' || f.kind === 'radio') && v && !f.options?.includes(v)) continue;
    out[f.name] = f.kind === 'text' && f.maxLength ? v.slice(0, f.maxLength) : v;
  }
  return out;
}

/** The PDF with the answers written in and drawn onto its pages. */
export async function fillForm(bytes: ArrayBuffer | Uint8Array, values: FormValues): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  for (const [name, v] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f) continue;
    if (f instanceof lib.PDFTextField && typeof v === 'string') f.setText(v || undefined);
    else if (f instanceof lib.PDFCheckBox && typeof v === 'boolean') { if (v) f.check(); else f.uncheck(); }
    else if ((f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) && typeof v === 'string') { if (v) f.select(v); else f.clear(); }
    else if (f instanceof lib.PDFRadioGroup && typeof v === 'string') { if (v) f.select(v); else f.clear(); }
  }
  // Text the form's own fonts can't show (accents beyond Latin-1, other scripts) can't be drawn with
  // the standard font: those fields keep their value in the field rather than failing the save.
  try { form.updateFieldAppearances(); form.flatten(); } catch { /* answers are still in the fields */ }
  return doc.save();
}
