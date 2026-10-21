/**
 * The viewer's time zone as people say it ("IST", "GMT+5:30", "PDT") with its full name
 * ("Asia/Kolkata"), for labels next to times (Phase E: online classes with people in other
 * zones). Browser only: on the server it would be the server's zone.
 */
export function zoneLabel(at = new Date(), timeZone?: string) {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short', ...(timeZone ? { timeZone } : {}) }).formatToParts(at);
  const short = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const full = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  return { short, full, text: short && full && short !== full ? `${short}, ${full.replace(/_/g, ' ')}` : (short || full) };
}
