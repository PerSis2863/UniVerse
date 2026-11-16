import { describe, expect, it } from 'vitest';
import { joinDictation, spoken } from './dictation';

describe('voice typing (M229)', () => {
  it('turns spoken punctuation into marks in English, and leaves other languages alone', () => {
    expect(spoken('see you tomorrow comma at nine full stop')).toBe('see you tomorrow, at nine.');
    expect(spoken('is it ready question mark new line yes')).toBe('is it ready?\nyes');
    expect(spoken('nos vemos mañana coma', 'es-ES')).toBe('nos vemos mañana coma');
  });
  it('joins a phrase like typing: a space between words, a capital after a sentence', () => {
    expect(joinDictation('', 'hello there')).toBe('Hello there');
    expect(joinDictation('Hello there.', 'how are you')).toBe('Hello there. How are you');
    expect(joinDictation('Hello', 'world')).toBe('Hello world');
    expect(joinDictation('Hello ', 'world')).toBe('Hello world');
    expect(joinDictation('Done', ', thanks')).toBe('Done, thanks');
  });
});
