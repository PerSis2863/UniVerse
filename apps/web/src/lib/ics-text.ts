// iCalendar text (RFC 5545), shared by the calendar feeds (src/server/ical.ts) and the files made in the
// browser (a Travel trip, M206): escaped values and folded lines.

export const esc = (v: string) => v.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545 §3.1). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
