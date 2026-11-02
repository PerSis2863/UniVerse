import { describe, expect, it } from 'vitest';
import { ELEMENTS } from './elements';
import { seeded } from './big-tools';
import { age, convertBase, cron, detectPitch, divisors, escapeHtml, fancy, fracOp, fromMorse, fromRoman, gcd, growth, isAnagram, isPalindrome, isPrime, jpegDetails, lcm, loan, lorem, mixed, mockRows, nameStyles, noteOf, numberToWords, parseFrac, primeFactors, settle, simulateColourBlind, COLOUR_BLIND, solveQuadratic, toMorse, toRoman, unescapeHtml } from './more-tools';

describe('more tools', () => {
  it('writes Morse both ways', () => {
    expect(toMorse('SOS help')).toBe('... --- ... / .... . .-.. .--.');
    expect(fromMorse('... --- ... / .... . .-.. .--.')).toBe('SOS HELP');
  });
  it('says numbers in words', () => {
    expect(numberToWords(1234.5)).toBe('one thousand two hundred and thirty-four point five');
    expect(numberToWords('-1000000')).toBe('minus one million');
    expect(numberToWords(0)).toBe('zero');
    expect(() => numberToWords('12a')).toThrow();
  });
  it('converts Roman numerals', () => {
    expect(toRoman(2026)).toBe('MMXXVI');
    expect(fromRoman('mcmxciv')).toBe(1994);
    expect(() => fromRoman('IIII')).toThrow();
    expect(() => toRoman(4000)).toThrow();
  });
  it('makes fancy letters', () => {
    expect(fancy('Hi 1', 'Bold')).toBe('𝐇𝐢 𝟏');
    expect(fancy('ah', 'Italic')).toBe('𝑎ℎ');
    expect(fancy('CR', 'Double-struck')).toBe('ℂℝ');
    expect(fancy('a1', 'Circled')).toBe('ⓐ①');
  });
  it('checks words and makes placeholder text', () => {
    expect(isAnagram('Listen', 'Silent')).toBe(true);
    expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
    expect(isPalindrome('UniVerse')).toBe(false);
    const t = lorem(2, 3, seeded(3));
    expect(t.startsWith('Lorem ipsum dolor sit amet')).toBe(true);
    expect(t.split('\n\n')).toHaveLength(2);
  });
  it('does number facts and fractions', () => {
    expect(primeFactors(360)).toEqual([2, 2, 2, 3, 3, 5]);
    expect(isPrime(97)).toBe(true);
    expect(divisors(28)).toEqual([1, 2, 4, 7, 14, 28]);
    expect(gcd(84, 36)).toBe(12); expect(lcm(4, 6)).toBe(12);
    expect(mixed(fracOp(parseFrac('1 1/2'), '+', parseFrac('3/4')))).toBe('2 1/4');
    expect(mixed(fracOp(parseFrac('2/3'), '÷', parseFrac('4')))).toBe('1/6');
    expect(parseFrac('0.25')).toEqual([1, 4]);
    expect(() => parseFrac('1/0')).toThrow();
  });
  it('solves equations', () => {
    expect(solveQuadratic(1, -5, 6).roots).toEqual(['3', '2']);
    expect(solveQuadratic(0, 2, -8).roots).toEqual(['4']);
    expect(solveQuadratic(1, 0, 1).roots).toEqual(['0 + 1i', '0 − 1i']);
  });
  it('does money and dates', () => {
    const l = loan(100000, 12, 12);
    expect(l.emi).toBeCloseTo(8884.88, 1);
    expect(l.rows[11].left).toBeCloseTo(0, 4);
    expect(growth(1000, 0, 12, 1)[0].balance).toBeCloseTo(1126.83, 1);
    expect(age('2000-02-29', '2026-11-01')).toMatchObject({ years: 26, months: 8, days: 3 });
    expect(settle([{ name: 'A', amount: 90 }, { name: 'B', amount: 0 }, { name: 'C', amount: 30 }]).moves).toEqual([{ from: 'B', to: 'A', amount: 40 }, { from: 'C', to: 'A', amount: 10 }]);
  });
  it('helps with code', () => {
    expect(convertBase('ff', 16, 2)).toBe('11111111');
    expect(convertBase('12345678901234567890', 10, 16)).toBe('ab54a98ceb1f0ad2');
    expect(() => convertBase('102', 2, 10)).toThrow();
    expect(nameStyles('userID count')).toMatchObject({ camelCase: 'userIdCount', snake_case: 'user_id_count', 'kebab-case': 'user-id-count' });
    expect(nameStyles('XMLHttpRequest').snake_case).toBe('xml_http_request');
    expect(unescapeHtml(escapeHtml('<a href="x">Tom & Jo\'s</a>'))).toBe('<a href="x">Tom & Jo\'s</a>');
    expect(unescapeHtml('&#x1F600; &copy;')).toBe('😀 ©');
  });
  it('reads cron schedules', () => {
    const c = cron('30 9 * * 1-5', new Date('2026-11-01T00:00:00Z'));
    expect(c.words).toBe('At 09:30, on Mon, Tue, Wed, Thu, Fri');
    expect(c.next[0].toISOString()).toBe('2026-11-02T09:30:00.000Z');
    expect(cron('*/15 * * * *', new Date('2026-11-01T10:07:00Z'), 2).next.map((d) => d.toISOString().slice(11, 16))).toEqual(['10:15', '10:30']);
    expect(() => cron('61 * * * *', new Date())).toThrow();
  });
  it('makes sample data', () => {
    const rows = mockRows(3, ['id', 'email', 'age'], seeded(5));
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(rows.every((r) => String(r.email).endsWith('@example.com'))).toBe(true);
  });
  it('hears a pitch and names the note', () => {
    const rate = 44100, buf = new Float32Array(4096).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5);
    const f = detectPitch(buf, rate)!;
    expect(f).toBeGreaterThan(437); expect(f).toBeLessThan(443);
    expect(noteOf(f)).toMatchObject({ note: 'A', octave: 4 });
    expect(noteOf(261.63).note).toBe('C');
    expect(detectPitch(new Float32Array(2048), rate)).toBeNull();
  });
  it('simulates colour blindness and finds a photo’s location tag', () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255]);
    simulateColourBlind(px, COLOUR_BLIND['No colour (achromatopsia)']);
    expect(px[0]).toBe(px[1]); expect(px[1]).toBe(px[2]);
    // A JPEG start, an APP1 "Exif" block with one IFD entry: the GPS pointer (0x8825), little-endian.
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xda]);
    expect(jpegDetails(jpg)).toEqual({ exif: true, gps: true });
    expect(jpegDetails(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toEqual({ exif: false, gps: false });
  });
  it('places all 118 elements', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENTS[25]).toMatchObject({ symbol: 'Fe', group: 8, period: 4, state: 'solid' });
    expect(ELEMENTS[79]).toMatchObject({ symbol: 'Hg', group: 12, state: 'liquid' });
    expect(ELEMENTS[56]).toMatchObject({ symbol: 'La', group: null, row: 9, col: 3 });
    expect(ELEMENTS[71]).toMatchObject({ symbol: 'Hf', group: 4, row: 6 });
    expect(ELEMENTS[117]).toMatchObject({ symbol: 'Og', group: 18, row: 7 });
    expect(new Set(ELEMENTS.map((e) => `${e.row}-${e.col}`)).size).toBe(118);
  });
});
