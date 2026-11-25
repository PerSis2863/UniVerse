import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// M475: IoT channels: owners only, keys kept as hashes, one reading a second, values checked.
type Row = Record<string, unknown>;
const sw = { emailOn: false };
const db = { channels: [] as Row[], entries: [] as Row[], alerts: [] as Row[], published: [] as unknown[], told: [] as unknown[] };
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
    iotAlert: {
      findMany: async ({ where }: { where: Row }) => db.alerts.filter((a) => a.channelId === where.channelId),
      count: async ({ where }: { where: Row }) => db.alerts.filter((a) => a.channelId === where.channelId).length,
      create: async ({ data }: { data: Row }) => { const a = { id: `a${db.alerts.length + 1}`, lastFiredAt: null, fired: 0, note: null, quietMinutes: 15, ...data }; db.alerts.push(a); return a; },
      findFirst: async ({ where }: { where: { id: string; channel: { userId: string } } }) => db.alerts.find((a) => a.id === where.id && db.channels.find((c) => c.id === a.channelId)?.userId === where.channel.userId) ?? null,
      delete: async ({ where }: { where: Row }) => { db.alerts = db.alerts.filter((a) => a.id !== where.id); },
      updateMany: async ({ where, data }: { where: { id: string; OR: { lastFiredAt?: { lt: Date } | null }[] }; data: Row }) => {
        const a = db.alerts.find((x) => x.id === where.id)!, last = a.lastFiredAt as Date | null, lt = where.OR[1].lastFiredAt as { lt: Date };
        if (last && !(last < lt.lt)) return { count: 0 };
        a.lastFiredAt = data.lastFiredAt; a.fired = (a.fired as number) + 1; return { count: 1 };
      },
    },
    iotEntry: {
      create: async ({ data }: { data: Row }) => { const e = { id: db.entries.length + 1, ...data }; db.entries.push(e); return e; },
      findMany: async ({ where }: { where: Row }) => db.entries.filter((e) => e.channelId === where.channelId).reverse(),
    },
  },
}));
vi.mock('./realtime', () => ({ publish: (...a: unknown[]) => db.published.push(a) }));
vi.mock('./email', () => ({ notify: async (...a: unknown[]) => { db.told.push(a); } }));
vi.mock('./moderation', () => ({ featureOff: async (id: string) => id === 'iot-email' && !sw.emailOn }));
vi.mock('./services/push.service', () => ({ pushService: { sendToMany: async () => 1 } }));

const { createChannel, myChannels, writeEntry, channelEntries, renewKey, deleteChannel, addAlert, channelAlerts, deleteAlert } = await import('./iot');
const alice = { id: 'alice' } as never, bob = { id: 'bob' } as never;

describe('IoT channels (M475)', () => {
  beforeEach(() => { db.channels = []; db.entries = []; db.alerts = []; db.published = []; db.told = []; vi.useRealTimers(); });
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
  it('M522: an alert tells the owner once per quiet time, only when a reading breaks it, and only the owner manages it', async () => {
    const { channel, writeKey } = await createChannel(alice, { name: 'Freezer', fields: ['Temperature', 'Door'] });
    await expect(addAlert(alice, channel.id, { field: 3, op: '>', value: 1 })).rejects.toThrow(/fields \(1 to 2\)/);
    await expect(addAlert(alice, channel.id, { field: 1, op: '!=', value: 1 })).rejects.toThrow(/above/);
    await expect(addAlert(bob, channel.id, { field: 1, op: '>', value: -10 })).rejects.toThrow(/isn’t yours/);
    const { alert } = await addAlert(alice, channel.id, { field: 1, op: '>', value: -10, note: 'The freezer is warming up', quietMinutes: 30 });
    vi.useFakeTimers({ now: new Date('2026-11-24T10:00:00Z') });
    await writeEntry(writeKey, { field1: -18 });
    expect(db.told).toHaveLength(0);
    vi.setSystemTime(new Date('2026-11-24T10:00:05Z'));
    await writeEntry(writeKey, { field1: -4 });
    expect(db.told).toHaveLength(1);
    expect((db.told[0] as [string, { title: string; body: string; email: boolean }])[1]).toMatchObject({ title: 'Temperature is -4 (> -10)', body: 'The freezer is warming up', email: false });
    vi.setSystemTime(new Date('2026-11-24T10:10:00Z'));
    await writeEntry(writeKey, { field1: -2 });
    expect(db.told).toHaveLength(1);
    vi.setSystemTime(new Date('2026-11-24T10:31:00Z'));
    await writeEntry(writeKey, { field1: -1 });
    expect(db.told).toHaveLength(2);
    expect((await channelAlerts(alice, channel.id)).alerts[0]).toMatchObject({ fired: 2, op: '>', value: -10 });
    await expect(deleteAlert(bob, alert.id)).rejects.toThrow(/isn’t yours/);
    await deleteAlert(alice, alert.id);
    expect(db.alerts).toHaveLength(0);
  });
  it('emails too only while the owner’s "Hyperion IoT alert emails" switch is on (M527)', async () => {
    const { channel, writeKey } = await createChannel(alice, { name: 'Tank', fields: ['Level'] });
    await addAlert(alice, channel.id, { field: 1, op: '<', value: 10, quietMinutes: 1 });
    vi.useFakeTimers({ now: new Date('2026-11-24T10:00:00Z') });
    sw.emailOn = true;
    await writeEntry(writeKey, { field1: 5 });
    expect((db.told[0] as [string, { email: boolean }])[1].email).toBe(true);
    sw.emailOn = false;
    vi.setSystemTime(new Date('2026-11-24T10:05:00Z'));
    await writeEntry(writeKey, { field1: 4 });
    expect((db.told[1] as [string, { email: boolean }])[1].email).toBe(false);
  });
});
