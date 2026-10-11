import { describe, expect, it } from 'vitest';
import { DOC_TEMPLATES, templateById } from './doc-templates';

describe('doc templates', () => {
  it('each has a unique id, a name, a heading and some sections', () => {
    expect(new Set(DOC_TEMPLATES.map((t) => t.id)).size).toBe(DOC_TEMPLATES.length);
    for (const t of DOC_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.html.startsWith('<h1>')).toBe(true);
      expect((t.html.match(/<h2>/g) ?? []).length).toBeGreaterThanOrEqual(3);
      expect(t.html).not.toMatch(/<script|on\w+=/i);
    }
  });
  it('finds a template by id, or none', () => {
    expect(templateById('essay')?.name).toBe('Essay');
    expect(templateById('nope')).toBeNull();
    expect(templateById(null)).toBeNull();
  });
});
