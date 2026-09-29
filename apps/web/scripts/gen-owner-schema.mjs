// Describes every table and field in prisma/schema.prisma for the owner console's record editor
// (src/server/owner-schema.json). The Prisma client used on Workers doesn't carry this metadata.
// Runs as part of `pnpm build`; run `node scripts/gen-owner-schema.mjs` after changing the schema.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').replace(/\/\/.*$/gm, '');

const blocks = [...src.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const enums = {};
for (const [, kind, name, body] of blocks) {
  if (kind === 'enum') enums[name] = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@@'));
}
const modelNames = new Set(blocks.filter((b) => b[1] === 'model').map((b) => b[2]));
const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes']);

const models = [];
for (const [, kind, name, body] of blocks) {
  if (kind !== 'model') continue;
  const fields = [];
  for (const line of body.split('\n').map((l) => l.trim())) {
    if (!line || line.startsWith('@@')) continue;
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!m) continue;
    const [, fname, type, list, optional, attrs] = m;
    const k = SCALARS.has(type) ? 'scalar' : enums[type] ? 'enum' : modelNames.has(type) ? 'object' : 'scalar';
    fields.push({
      name: fname,
      type,
      kind: k,
      list: !!list,
      optional: !!optional,
      id: /@id\b/.test(attrs),
      unique: /@unique\b/.test(attrs),
      hasDefault: /@default\(/.test(attrs),
      updatedAt: /@updatedAt\b/.test(attrs),
      // For relations: the local columns holding the other record's id, e.g. ["userId"]
      ...(k === 'object' ? { relationFields: (attrs.match(/fields:\s*\[([^\]]*)\]/)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) } : {}),
    });
  }
  const map = body.match(/@@map\("([^"]+)"\)/);
  models.push({ name, delegate: name.charAt(0).toLowerCase() + name.slice(1), table: map ? map[1] : name, fields });
}

writeFileSync(join(root, 'src/server/owner-schema.json'), JSON.stringify({ enums, models }, null, 1) + '\n');
console.log(`owner-schema.json: ${models.length} models, ${Object.keys(enums).length} enums`);
