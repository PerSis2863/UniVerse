import { describe, expect, it } from 'vitest';
import { escapeHtml, exportFileName, stamp, toHtml, toText, type ExportMessage } from './chat-export';

const msgs: ExportMessage[] = [
  { at: '2026-10-10T22:30:00Z', from: 'Asha', type: 'TEXT', text: 'Hello <team>' },
  { at: '2026-10-11T08:05:00Z', from: 'Ravi', type: 'FILE', text: '', attachment: { name: 'notes.pdf', url: 'https://x.test/notes.pdf' }, replyTo: { from: 'Asha', text: 'Hello <team>' } },
  { at: '2026-10-11T08:06:00Z', from: 'Asha', type: 'TEXT', text: 'Thanks', edited: true, reactions: { '👍': 2 } },
];

describe('chat export', () => {
  it('stamps times in a given zone', () => {
    expect(stamp('2026-10-11T08:05:00Z', 'Asia/Kolkata')).toBe('2026-10-11 13:35');
    expect(stamp('2026-10-10T22:30:00Z', 'UTC')).toBe('2026-10-10 22:30');
  });
  it('writes plain text lines with replies, files and edits', () => {
    const t = toText('Study group', msgs, '2026-10-11T09:00:00Z', 'UTC');
    expect(t.split('\n').slice(0, 2)).toEqual(['Study group', 'Exported from UniVerse on 2026-10-11 09:00 · 3 messages']);
    expect(t).toContain('[2026-10-10 22:30] Asha: Hello <team>');
    expect(t).toContain('[2026-10-11 08:05] Ravi (replying to Asha: "Hello <team>"): [notes.pdf]');
    expect(t).toContain('[2026-10-11 08:06] Asha: Thanks (edited)');
  });
  it('writes a safe page with a heading per day', () => {
    const h = toHtml('Study <group>', msgs, '2026-10-11T09:00:00Z', 'UTC');
    expect(h).toContain('<title>Study &lt;group&gt;</title>');
    expect(h).toContain('Hello &lt;team&gt;');
    expect(h).not.toContain('<team>');
    expect(h.match(/<h2>/g)).toHaveLength(2);
    expect(h).toContain('<a href="https://x.test/notes.pdf">notes.pdf</a>');
    expect(h).toContain('👍 2');
  });
  it('escapes and names files', () => {
    expect(escapeHtml(`a"b'<c>&`)).toBe('a&quot;b&#39;&lt;c&gt;&amp;');
    expect(exportFileName('Study group!', 'html', '2026-10-11T09:00:00Z')).toBe('Study-group-2026-10-11.html');
    expect(exportFileName('', 'txt', '2026-10-11T09:00:00Z')).toBe('chat-2026-10-11.txt');
  });
});
