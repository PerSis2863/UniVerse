import { describe, expect, it } from 'vitest';
import { cleanAvailability, cleanBio, cleanLinks, cleanPronouns, linkLabel } from './profile';
import { SETTINGS, searchSettings, settingHref } from './settings-index';

describe('profile', () => {
  it('keeps pronouns, about and availability tidy', () => {
    expect(cleanPronouns(' she/her ')).toBe('she/her');
    expect(cleanPronouns('<b>x</b>')).toBe(null);
    expect(cleanPronouns('')).toBe(null);
    expect(cleanBio('Hi!\n\n\n\nI study CS.  ')).toBe('Hi!\n\nI study CS.');
    expect(cleanAvailability('  Usually free   Tue afternoons ')).toBe('Usually free Tue afternoons');
  });
  it('takes up to 5 https links, labelled', () => {
    expect(cleanLinks([{ url: 'github.com/ada' }, { url: 'http://linkedin.com/in/ada', label: '' }, { url: 'javascript:alert(1)' }, { url: 'ftp://x.org' }, { url: 'https://github.com/ada' }]))
      .toEqual([{ label: 'GitHub', url: 'https://github.com/ada' }, { label: 'LinkedIn', url: 'https://linkedin.com/in/ada' }]);
    expect(cleanLinks(Array.from({ length: 8 }, (_, i) => ({ url: `https://site${i}.org` })))).toHaveLength(5);
    expect(linkLabel('https://www.kaggle.com/ada')).toBe('Kaggle');
  });
});

describe('settings search', () => {
  it('finds one setting by its words, for the right people', () => {
    expect(searchSettings('dark', 'STUDENT').map((s) => s.id)).toContain('theme');
    expect(searchSettings('quiet hours', 'STUDENT').map((s) => s.id)).toEqual(['quiet-hours']);
    expect(searchSettings('parent contact hours', 'STUDENT')).toEqual([]);
    expect(searchSettings('parent contact hours', 'TEACHER').map((s) => s.id)).toEqual(['parent-hours']);
    expect(settingHref('/student/settings', SETTINGS.find((s) => s.id === 'theme')!)).toBe('/student/settings?section=appearance&setting=theme');
    expect(new Set(SETTINGS.map((s) => s.id)).size).toBe(SETTINGS.length);
  });
});
