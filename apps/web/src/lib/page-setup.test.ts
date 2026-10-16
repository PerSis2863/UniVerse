import { describe, expect, it } from 'vitest';
import { cleanPage, pageCss } from './page-setup';

describe('page setup', () => {
  it('keeps only known values', () => {
    expect(cleanPage({ size: 'A3', orientation: 'landscape', margins: 'huge', header: 'x'.repeat(500), numbers: 'yes' })).toEqual({ size: 'A4', orientation: 'landscape', margins: 'normal', header: 'x'.repeat(200), footer: '', numbers: false });
  });
  it('prints the paper, margins, header, footer and page numbers', () => {
    const css = pageCss({ size: 'A4', orientation: 'landscape', margins: 'narrow', header: 'Say "hi"', footer: '', numbers: true });
    expect(css).toContain('size:297mm 210mm;margin:12.7mm');
    expect(css).toContain('@top-center{content:"Say \\"hi\\""');
    expect(css).toContain('counter(page) " of " counter(pages)');
    expect(css).not.toContain('@bottom-left');
  });
});
