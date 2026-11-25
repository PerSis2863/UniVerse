// Sample answers for Hyperion Signals → IoT (M475): one greenhouse channel with a day of readings every 15 minutes.
const FIELDS = ['Temperature (°C)', 'Humidity (%)', 'Soil moisture (%)'];
const channel = () => ({ id: 'sample-iot', name: 'Greenhouse', description: 'An ESP32 by the tomatoes', fields: FIELDS, keyHint: 'K7QX', entries: 96, lastEntryAt: new Date(Date.now() - 60_000).toISOString(), createdAt: new Date(Date.now() - 86_400_000 * 3).toISOString() });

/** GET /iot/channels */
export const sampleIotChannels = () => ({ channels: [channel()], max: 10 });
/** GET /iot/channels/:id/entries */
export function sampleIotEntries() {
  const now = Date.now();
  return {
    channel: channel(),
    entries: Array.from({ length: 96 }, (_, i) => {
      const t = now - (95 - i) * 900_000, h = ((t / 3600_000) % 24) / 24;
      return { id: i + 1, at: new Date(t).toISOString(), values: [+(19 + 7 * Math.sin(2 * Math.PI * (h - 0.35))).toFixed(1), +(70 - 15 * Math.sin(2 * Math.PI * (h - 0.35))).toFixed(1), +(42 - (i % 48) * 0.3 + (i % 48 === 0 ? 14 : 0)).toFixed(1)] };
    }),
  };
}
/** GET /iot/channels/:id/alerts (M522) */
export const sampleIotAlerts = () => ({ alerts: [{ id: 'smp-alert', field: 1, op: '>', value: 30, note: 'Too warm for the seedlings', quietMinutes: 15, lastFiredAt: null, fired: 0 }], max: 10 });
