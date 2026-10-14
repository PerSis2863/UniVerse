import { readdirSync, readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

// Every model in prisma/schema.prisma must match the table the hand-written migrations make: each field
// has a column (with @map when the column is named differently, e.g. snake_case), and every required
// column without a default is a field (or creating a row fails). Migrations 0111/0112 made snake_case
// columns the models didn't map, and Admin → Integrations answered 500 without any test noticing.
// Node's built-in SQLite (the installed type definitions predate it, so the two calls used are declared here).
type Sqlite = { exec(sql: string): void; prepare(sql: string): { all(): unknown[] } };
const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): { DatabaseSync: new (path: string) => Sqlite } }).getBuiltinModule('node:sqlite');

describe('database schema', () => {
  it('every model matches its table after all migrations', () => {
    const db = new DatabaseSync(':memory:');
    const dir = new URL('../../prisma/migrations/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
    const problems: string[] = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName ?? model.name;
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; notnull: number; dflt_value: unknown; pk: number }[];
      if (!columns.length) {
        problems.push(`${model.name}: no table ${table}`);
        continue;
      }
      const names = new Set(columns.map((c) => c.name));
      const fields = model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.dbName ?? f.name);
      for (const f of fields) if (!names.has(f)) problems.push(`${model.name}.${f}: no such column in ${table}`);
      for (const c of columns) if (c.notnull && c.dflt_value === null && !c.pk && !fields.includes(c.name)) problems.push(`${table}.${c.name}: required, but no field writes it`);
    }
    expect(problems).toEqual([]);
  });
});
