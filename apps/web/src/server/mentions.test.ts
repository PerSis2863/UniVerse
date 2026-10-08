import { describe, expect, it } from 'vitest';
import { mentioned } from './mentions';

const people = [
  { id: 'jane', name: 'Jane Smith' },
  { id: 'raj', name: 'Dr. Raj Patel' },
  { id: 'al', name: 'Al' },
  { id: 'ana', name: 'Ana Lima' },
];

describe('mentioned', () => {
  it('nobody without an @', () => expect(mentioned('Jane Smith said hi', people)).toEqual([]));
  it('by first name', () => expect(mentioned('thanks @Jane!', people)).toEqual(['jane']));
  it('by full name', () => expect(mentioned('cc @jane smith', people)).toEqual(['jane']));
  it('ignores titles', () => {
    expect(mentioned('@Raj can you check?', people)).toEqual(['raj']);
    expect(mentioned('@Raj Patel can you check?', people)).toEqual(['raj']);
    expect(mentioned('@Dr. Raj Patel can you check?', people)).toEqual(['raj']);
  });
  it('several people', () => expect(mentioned('@Jane and @Ana', people).sort()).toEqual(['ana', 'jane']));
  it('not a longer word', () => expect(mentioned('@Janet is new', people)).toEqual([]));
  it('not inside an email address', () => expect(mentioned('mail jane@jane.com', people)).toEqual([]));
  it('first names need two letters', () => expect(mentioned('@A hello', [{ id: 'a', name: 'A B' }])).toEqual([]));
  it('a short full name still works by full name', () => expect(mentioned('hi @al', people)).toEqual(['al']));
  it('works with accents', () => expect(mentioned('@Zoé merci', [{ id: 'z', name: 'Zoé Martin' }])).toEqual(['z']));
});
