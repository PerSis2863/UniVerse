import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// M475: IoT channels: owners only, keys kept as hashes, one reading a second, values checked.
type Row = Record<string, unknown>;
const db = { channels: [] as Row[], entries: [] as Row[], published: [] as unknown[] };
vi.mock('@/lib/db', () => ({
  default: {
    iotChannel: {
      count: async ({ where }: { where: Row }) => db.channels.filter((c) => c.userId === where.userId).length,
      create: async ({ data }: { data: Row }) => { const c = { id: `c${db.channels.length + 1}`, entries: 0, lastEntryAt: null, createdAt: new Date(), description: null, ...data }; db.channels.push(c); return c; },
      findFirst: async ({ where }: { where: Row }) => db.channels.find((c) => c.id === where.id && c.userId === where.userId) ?? null,
      findUnique: async ({ where }: { where: Row }) => db.channels.find((c) => c.keyHash === where.keyHash) ?? null,
      findMany: async ({ where }: { where: Row }) => db.channels.filter((c) => c.userId === where.userId),
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(db.channels.find((c) => c.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: string; OR: { lastEntryAt?: { lt: Date } | null }[] }; data: Row }) => {
        const c = db.channels.find((x) => x.id === where.id)!, last = c.lastEntryAt as Date | null, lt = where.OR[1].lastEntryAt as { lt: Date };
        if (last && !(last < lt.lt)) return { count: 0 };
        c.lastEntryAt = data.lastEntryAt; return { count: 1 };
      },
      delete: async ({ where }: { where: Row }) => { db.channels = db.channels.filter((c) => c.id !== where.id); },
    },
    iotEntry: {
      create: async ({ data }: { data: Row }) => { const e = { id: db.entries.length + 1, ...data }; db.entries.push(e); return e; },
      findMany: async ({ where }: { where: Row }) => db.entries.filter((e) => e.channelId === where.channelId).reverse(),
    },
  },
}));
vi.mock('./realtime', () => ({ publish: (...a: unknown[]) => db.published.push(a) }));

const { createChannel, myChannels, writeEntry, channelEntries, renewKey, deleteChannel } = await import('./iot');
const alice = { id: 'alice' } as never, bob = { id: 'bob' } as never;

describe('IoT channels (M475)', () => {
  beforeEach(() => { db.channels = []; db.entries = []; db.published = []; vi.useRealTimers(); });
  it('creates a channel, shows its key once and keeps only the hash', async () => {
    const r = await createChannel(alice, { name: 'Greenhouse', fields: ['Temperature', 'Humidity', ''] });
    expect(r.writeKey).toMatch(/^[A-Z2-9]{20}$/);
    expect(r.channel.fields).toEqual(['Temperature', 'Humidity']);
    expect(db.channels[0].keyHash).toBe(crypto.createHash('sha256').update(r.writeKey).digest('hex'));
    expect(JSON.stringify(await myChannels(alice))).not.toContain(r.writeKey);
    await expect(createChannel(alice, { name: 'x', fields: [] })).rejects.toThrow(/field/);
  });
  it('takes a device’s reading by key, one a second, and only the owner reads it', async () => {
    const { channel, writeKey } = await createChannel(alice, { name: 'Greenhouse', fields: ['Temperature', 'Humidity'] });
    expect(await writeEntry(writeKey, { field1: '21.5', field2: 60, field3: 9 })).toMatchObject({ ok: true });
    expect(db.entries[0]).toMatchObject({ f1: 21.5, f2: 60, f3: null });
    expect(await writeEntry(writeKey, { field1: 22 })).toMatchObject({ ok: false });
    expect(db.published.length).toBe(1);
    await expect(writeEntry('AAAAAAAAAAAAAAAAAAAA', { field1: 1 })).rejects.toThrow(/Unknown/);
    await expect(writeEntry("x' OR 1=1", { field1: 1 })).rejects.toThrow(/Unknown/);
    db.channels[0].lastEntryAt = new Date(0);
    await expect(writeEntry(writeKey, { field1: 'hot' })).rejects.toThrow(/field1/);
    expect((await channelEntries(alice, channel.id)).entries[0].values).toEqual([21.5, 60]);
    await expect(channelEntries(bob, channel.id)).rejects.toThrow(/isn’t yours/);
    await expect(deleteChannel(bob, channel.id)).rejects.toThrow(/isn’t yours/);
    const fresh = await renewKey(alice, channel.id);
    await expect(writeEntry(writeKey, { field1: 1 })).rejects.toThrow(/Unknown/);
    expect(await writeEntry(fresh.writeKey, { field1: 1 })).toMatchObject({ ok: true });
  });
});
