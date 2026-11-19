import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkPreview, privateHost } from './link-preview';

// M337: a chat link's preview is read by the server, so it must never be led to an internal address, by the link
// itself or by a redirect from a public page.
afterEach(() => vi.unstubAllGlobals());
const page = (title: string) => new Response(`<html><head><title>${title}</title></head></html>`, { headers: { 'content-type': 'text/html' } });

describe('link previews', () => {
  it('knows private and internal addresses', () => {
    for (const h of ['localhost', 'api.localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '[::1]', 'intranet', 'metadata.google.internal', '224.0.0.1']) expect(privateHost(h), h).toBe(true);
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1']) expect(privateHost(h), h).toBe(false);
  });

  it('refuses internal links, odd ports and passwords in the address', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const u of ['http://127.0.0.1/', 'http://2130706433/', 'https://example.com:8080/', 'https://user:pw@example.com/']) expect(await linkPreview(u)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops at a redirect to an internal address', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await linkPreview('https://example.com/go')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/new' } })).mockResolvedValueOnce(page('Hello'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await linkPreview('https://example.com/old')).toMatchObject({ url: 'https://example.com/new', title: 'Hello' });
  });
});
