import { describe as group, expect, it } from 'vitest';
import { actionsFor, describe, matching, type Rule } from './task-automation';

const rule = (p: Partial<Rule>): Rule => ({ id: 'r', trigger: 'moved', listId: null, action: 'notify', userId: null, value: null, enabled: true, ...p });

group('task automations', () => {
  it('matches events by trigger and list, skipping switched-off rules', () => {
    const rules = [rule({ id: 'a', listId: 'done' }), rule({ id: 'b' }), rule({ id: 'c', trigger: 'created' }), rule({ id: 'd', listId: 'done', enabled: false })];
    expect(matching(rules, { kind: 'moved', listId: 'done' }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(matching(rules, { kind: 'moved', listId: 'doing' }).map((r) => r.id)).toEqual(['b']);
    expect(matching(rules, { kind: 'created', listId: 'todo' }).map((r) => r.id)).toEqual(['c']);
  });
  it('limits what a due-soon rule can do', () => {
    expect(actionsFor('due-soon')).toEqual(['notify']);
    expect(actionsFor('moved')).toContain('done');
  });
  it('reads as a sentence', () => {
    const list = (id: string) => ({ done: 'Done', todo: 'To do' })[id];
    const person = (id: string) => ({ u1: 'Asha' })[id];
    expect(describe(rule({ listId: 'done', userId: 'u1' }), list, person)).toBe('When a card moves to “Done”, tell Asha.');
    expect(describe(rule({ trigger: 'created', action: 'label', value: 'New' }), list, person)).toBe('When a card is added to any list, add the label “New”.');
    expect(describe(rule({ trigger: 'due-soon' }), list, person)).toBe('When a card is due within a day, tell whoever it’s given to.');
    expect(describe(rule({ action: 'priority', value: 'HIGH', listId: 'todo' }), list, person)).toBe('When a card moves to “To do”, set the priority to high.');
  });
});
