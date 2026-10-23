import { describe, expect, it } from 'vitest';
import { unsupportedBrowser } from './browser-support';

describe('outdated browsers and bots (error hub)', () => {
  it("recognises the report that wasn't a fault: a made-up Mac signature on Chrome 71", () => {
    expect(unsupportedBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 9_1_1) AppleWebKit/578.36 (KHTML, like Gecko) Chrome/71.0.167 Safari/537.36')).toMatch(/made-up/);
    expect(unsupportedBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/71.0.3578.98 Safari/537.36')).toMatch(/Chrome 71/);
    expect(unsupportedBrowser('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toMatch(/automated/);
    expect(unsupportedBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 Version/14.1.2 Mobile/15E148 Safari/604.1')).toMatch(/Safari 14.1/);
  });

  it('leaves current browsers alone', () => {
    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 EdgA/140.0',
      null,
    ]) expect(unsupportedBrowser(ua)).toBeNull();
  });
});
