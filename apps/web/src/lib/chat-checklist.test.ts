import { describe, expect, it } from 'vitest';
import { newChecklist, progress, toggleItem, type Checklist } from './chat-checklist';

describe('chat checklists', () => {
  it('makes one from what was typed, without blanks or repeats', () => {
    expect(newChecklist({ title: ' Trip ', items: ['Tickets', '', 'Tickets', 'Hotel'] })).toEqual({ title: 'Trip', items: [{ text: 'Tickets', done: null }, { text: 'Hotel', done: null }] });
    expect(newChecklist({ title: '', items: ['a'] })).toHaveProperty('error');
    expect(newChecklist({ title: 'x', items: [] })).toHaveProperty('error');
    expect(newChecklist({ title: 'x', items: Array.from({ length: 31 }, (_, i) => `i${i}`) })).toHaveProperty('error');
  });
  it('ticks and unticks, keeping who did it', () => {
    const list = newChecklist({ title: 'T', items: ['a', 'b'] }) as Checklist;
    const ticked = toggleItem(list, 1, { id: 'u1', name: 'Sam Lee' }, new Date('2026-11-19T10:00:00Z'))!;
    expect(ticked.items[1].done).toEqual({ by: 'u1', name: 'Sam', at: '2026-11-19T10:00:00.000Z' });
    expect(progress(ticked)).toBe('1 of 2 done');
    expect(toggleItem(ticked, 1, { id: 'u2', name: 'Ana' })!.items[1].done).toBeNull();
    expect(toggleItem(list, 5, { id: 'u1', name: 'S' })).toBeNull();
  });
});
