import { describe, expect, it } from 'vitest';
import { LANGUAGES as APP } from './i18n';
import { LANGUAGES as CHAT, isLanguage, languageName } from './languages';
import { LANGUAGE_SCRIPT, RTL_LANGUAGES } from './language-script';

// M403, the owner, 22 Nov: "keep hindi and remove all the other indian language and also remove the urdu".
describe('the languages offered', () => {
  const gone = ['ur', 'bn', 'ta', 'te', 'mr'];
  it('Hindi stays; Urdu, Bengali, Tamil, Telugu and Marathi are not offered', () => {
    expect(APP.map((l) => l.code)).toContain('hi');
    expect(Object.keys(CHAT)).toContain('hi');
    for (const c of gone) { expect(APP.some((l) => l.code === c)).toBe(false); expect(isLanguage(c)).toBe(false); }
    expect(RTL_LANGUAGES).toEqual(['ar']);
  });
  it('a message written in one of them is still named', () => {
    expect(languageName('ur')).toBe('Urdu');
    expect(languageName('und')).toBe('another language');
  });
  it('a saved language no longer offered leaves the page English and left to right', () => {
    const run = (saved: string) => {
      const html = { lang: 'en', dir: 'ltr' };
      new Function('localStorage', 'document', LANGUAGE_SCRIPT)({ getItem: () => JSON.stringify({ state: { language: saved } }) }, { documentElement: html });
      return html;
    };
    expect(run('ur')).toEqual({ lang: 'en', dir: 'ltr' });
    expect(run('ar')).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(run('hi')).toEqual({ lang: 'hi', dir: 'ltr' });
  });
});
