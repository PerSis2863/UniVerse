import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cleanValues, fillForm, readForm } from './pdf-form';

async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const form = doc.getForm();
  form.createTextField('name').addToPage(page, { x: 20, y: 340, width: 200, height: 24 });
  const notes = form.createTextField('notes'); notes.enableMultiline(); notes.addToPage(page, { x: 20, y: 260, width: 200, height: 60 });
  form.createCheckBox('agree').addToPage(page, { x: 20, y: 220, width: 16, height: 16 });
  const year = form.createDropdown('year'); year.addOptions(['Year 1', 'Year 2']); year.addToPage(page, { x: 20, y: 180, width: 120, height: 24 });
  const meal = form.createRadioGroup('meal'); meal.addOptionToPage('veg', page, { x: 20, y: 140, width: 16, height: 16 }); meal.addOptionToPage('any', page, { x: 60, y: 140, width: 16, height: 16 });
  const fixed = form.createTextField('school'); fixed.setText('UniVerse High'); fixed.enableReadOnly(); fixed.addToPage(page, { x: 20, y: 100, width: 200, height: 24 });
  return doc.save();
}

describe('filling in a PDF form (B9)', () => {
  it('lists the fields with their kind and current answer', async () => {
    const fields = await readForm(await formPdf());
    expect(fields.map((f) => [f.name, f.kind])).toEqual([['name', 'text'], ['notes', 'text'], ['agree', 'check'], ['year', 'choice'], ['meal', 'radio'], ['school', 'text']]);
    expect(fields.find((f) => f.name === 'notes')?.multiline).toBe(true);
    expect(fields.find((f) => f.name === 'year')?.options).toEqual(['Year 1', 'Year 2']);
    expect(fields.find((f) => f.name === 'school')).toMatchObject({ value: 'UniVerse High', readOnly: true });
    expect(await readForm(await (await PDFDocument.create()).save())).toEqual([]); // not a form
    expect(await readForm(new Uint8Array([1, 2, 3]))).toEqual([]); // not a PDF
  });

  it('keeps only answers that changed and fit', async () => {
    const fields = await readForm(await formPdf());
    expect(cleanValues(fields, { name: 'Sam', agree: true, year: 'Year 9', meal: 'veg', school: 'Other', notes: '' })).toEqual({ name: 'Sam', agree: true, meal: 'veg' });
  });

  it('writes the answers onto the pages', async () => {
    const filled = await fillForm(await formPdf(), { name: 'Sam Lee', agree: true, year: 'Year 2', meal: 'any' });
    const back = await PDFDocument.load(filled);
    expect(back.getForm().getFields()).toHaveLength(0); // flattened: part of the page now
    expect(back.getPageCount()).toBe(1);
    expect(filled.length).toBeGreaterThan(1000);
  });
});
