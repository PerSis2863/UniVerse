import { describe, expect, it } from 'vitest';
import { LANGUAGES, PHRASES, TAKE_ME, languageFor } from './travel-phrases';

describe('phrasebook (M241)', () => {
  it('has every phrase and the numbers in every language, with how to say it for other scripts', () => {
    for (const l of LANGUAGES) {
      for (const [k] of PHRASES) expect(l.phrases[k].text, `${l.id} ${k}`).toBeTruthy();
      expect(l.numbers).toHaveLength(10);
      const latin = /^[\p{Script=Latin}\p{P}\p{Zs}\d/]+$/u.test(l.phrases.thanks.text);
      if (!latin) for (const [k] of PHRASES) expect(l.phrases[k].say, `${l.id} ${k}`).toBeTruthy();
      expect(l.tag).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(LANGUAGES.length);
    expect(Object.keys(TAKE_ME).sort()).toEqual(LANGUAGES.map((l) => l.id).sort()); // M253's driver phrase in each
  });
  it('picks the language of a country', () => {
    expect(languageFor('pt')).toMatchObject({ id: 'pt' });
    expect(languageFor('BR')).toMatchObject({ id: 'pt-BR', phrases: { toilet: { text: 'Onde fica o banheiro?' } } });
    expect(languageFor('JP')).toMatchObject({ tag: 'ja-JP', phrases: { thanks: { say: 'Arigatō gozaimasu' } } });
    expect(languageFor('EG')).toMatchObject({ rtl: true });
    expect(languageFor('GB')).toBe('english');
    expect(languageFor('IS')).toBeNull();
    expect(languageFor(null)).toBeNull();
  });
});
