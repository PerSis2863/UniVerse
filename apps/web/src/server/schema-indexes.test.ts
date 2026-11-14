import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// M183: every relation column leads an index (or is the id or unique). Without one, SQLite reads the
// whole child table when a parent row is deleted or re-keyed, and so does any list filtered by that
// column; D1 bills every row read. 62 were missing; this fails a new relation that forgets its index.
describe('database indexes', () => {
  it('every relation column leads an index', () => {
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const missing: string[] = [];
    for (const [, name, body] of schema.matchAll(/\nmodel (\w+) \{\n([\s\S]*?)\n\}/g)) {
      const lead = new Set<string>();
      for (const [, fields] of body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)) lead.add(fields.split(',')[0].trim().split('(')[0]);
      for (const line of body.split('\n')) {
        const [field] = line.trim().split(/\s+/);
        if (field && !field.startsWith('@@') && /@id\b|@unique\b/.test(line)) lead.add(field);
      }
      for (const [, fields] of body.matchAll(/@relation\((?:"[^"]*",\s*)?fields:\s*\[([^\]]+)\]/g)) {
        const first = fields.split(',')[0].trim();
        if (!lead.has(first)) missing.push(`${name}.${first}: add @@index([${first}]) and a CREATE INDEX in a migration`);
      }
    }
    expect(missing).toEqual([]);
  });
});
