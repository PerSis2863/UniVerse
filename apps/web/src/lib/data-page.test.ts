import { describe, expect, it } from 'vitest';
import { dataPage } from './data-page';

describe('a readable copy of my data', () => {
  it('escapes what people typed and lists each kind of record', () => {
    const html = dataPage({ exportedAt: '2026-11-18', profile: { name: 'Ana <b>' }, data: { 'Chat Message': [{ body: '<script>alert(1)</script>', meta: { a: 1 } }], Empty: [] } });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).toContain('href="#chat-message">Chat Message</a> (1)');
    expect(html).not.toContain('Empty');
  });
});
