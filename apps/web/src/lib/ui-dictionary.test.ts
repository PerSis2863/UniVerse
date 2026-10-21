import { describe, expect, it } from 'vitest';
import { CHUNKS, chunkOf, cleanChunk, compile, translateText } from './ui-dictionary';

// Stage 5 · Q21: the screens' dictionary — parts, cleaning, exact text, patterns, dates.
const part = (s: Record<string, string>) => [{ s, r: [] }];

describe('ui dictionary', () => {
  it('puts each text in a fixed part', () => {
    expect(chunkOf('Save')).toBe(chunkOf('Save'));
    expect(chunkOf('Save')).toBeGreaterThanOrEqual(0);
    expect(chunkOf('Save')).toBeLessThan(CHUNKS);
    const spread = new Set(Array.from({ length: 500 }, (_, i) => chunkOf(`text ${i}`)));
    expect(spread.size).toBe(CHUNKS);
  });

  it('keeps only text that belongs in the part, and patterns that keep their places', () => {
    const c = chunkOf('Save');
    const other = ['Cancel', 'Delete', 'Open', 'Close', 'Next'].find((x) => chunkOf(x) !== c)!;
    const p = cleanChunk({ s: { Save: ' حفظ ', [other]: 'x', ['{0} open reports'.repeat(1)]: 'no place' }, r: ['Save', 'nope'] }, c);
    expect(p.s.Save).toBe('حفظ');
    expect(p.s[other]).toBeUndefined();
    expect(p.r).toEqual(['Save']);
    const k = '{0} open reports';
    expect(cleanChunk({ s: { [k]: 'تقارير مفتوحة' } }, chunkOf(k)).s[k]).toBeUndefined(); // lost {0}
    expect(cleanChunk({ s: { [k]: '{0} تقارير مفتوحة' } }, chunkOf(k)).s[k]).toBe('{0} تقارير مفتوحة');
    expect(cleanChunk('garbage', 0)).toEqual({ s: {}, r: [] });
  });

  it('translates exact text, keeping the spaces around it', () => {
    const d = compile(part({ Save: 'حفظ', 'Add a chat app': 'أضف تطبيق دردشة' }), 'ar');
    expect(translateText(d, '  Save ')).toBe('  حفظ ');
    expect(translateText(d, 'Add  a chat\napp')).toBe('أضف تطبيق دردشة');
    expect(translateText(d, 'Unknown')).toBeNull();
    expect(translateText(d, '42')).toBeNull();
  });

  it('fills patterns, also when the language puts the values in another order', () => {
    const d = compile(part({ '{0} of {1} seats': '{1} مقعد، مستخدم {0}', 'Hello {0}': 'مرحبا {0}' }), 'ar');
    expect(translateText(d, '40 of 50 seats')).toBe('50 مقعد، مستخدم 40');
    expect(translateText(d, 'Hello Asha')).toBe('مرحبا Asha');
  });

  it('never lets a pattern with almost no words of its own touch people’s sentences', () => {
    const d = compile(part({ '{0} to {1}': '{0} إلى {1}', '{0} on {1}': '{0} على {1}', 'Hello {0}': 'مرحبا {0}' }), 'ar');
    expect(translateText(d, 'Review Introduction to Computer Science')).toBeNull();
    expect(translateText(d, 'Work on cutting edge technologies.')).toBeNull();
    expect(translateText(d, 'Hello Asha')).toBe('مرحبا Asha');
  });

  it('writes how long ago in the language', () => {
    const d = compile(part({}), 'fr-FR');
    expect(translateText(d, '22 days ago')).toBe('il y a 22 jours');
    expect(translateText(d, 'about 1 hour ago')).toBe('il y a 1 heure');
    expect(translateText(d, 'in 3 days')).toBe('dans 3 jours');
    expect(translateText(d, '3 days')).toBeNull();
  });

  it('writes month and day names in the language when the rest is unknown', () => {
    const d = compile(part({}), 'fr-FR');
    expect(translateText(d, 'Monday, September 28')).toBe('lundi, septembre 28');
  });
});
