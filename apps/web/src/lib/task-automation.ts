// Task board automations (Stage 5 · B9.10): "when this happens, do that". Rules run in the request
// that triggers them (a card moved or made); "due within a day" runs from the 15-minute check.

export const TRIGGERS = ['moved', 'created', 'due-soon'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export const ACTIONS = ['notify', 'assign', 'priority', 'label', 'done'] as const;
export type Action = (typeof ACTIONS)[number];
export const MAX_RULES = 20;

export interface Rule { id: string; trigger: Trigger; listId: string | null; action: Action; userId: string | null; value: string | null; enabled: boolean }

/** Which actions make sense for a trigger: a card due soon can only be told about. */
export function actionsFor(trigger: Trigger): Action[] {
  return trigger === 'due-soon' ? ['notify'] : ['notify', 'assign', 'priority', 'label', 'done'];
}

/** The rules a card event sets off: moved into a list, or made in one (no list = any list). */
export function matching(rules: Rule[], event: { kind: 'moved' | 'created'; listId: string }): Rule[] {
  return rules.filter((r) => r.enabled && r.trigger === event.kind && (!r.listId || r.listId === event.listId));
}

/** A rule as a sentence: "When a card moves to Done, tell Asha". */
export function describe(r: Pick<Rule, 'trigger' | 'listId' | 'action' | 'userId' | 'value'>, list: (id: string) => string | undefined, person: (id: string) => string | undefined) {
  const where = r.listId ? `“${list(r.listId) ?? 'a list'}”` : 'any list';
  const when = r.trigger === 'moved' ? `When a card moves to ${where}` : r.trigger === 'created' ? `When a card is added to ${where}` : 'When a card is due within a day';
  const who = r.userId ? person(r.userId) ?? 'someone' : 'whoever it’s given to';
  const then = r.action === 'notify' ? `tell ${who}` : r.action === 'assign' ? `give it to ${r.userId ? person(r.userId) ?? 'someone' : 'nobody'}` : r.action === 'priority' ? `set the priority to ${(r.value ?? '').toLowerCase()}` : r.action === 'label' ? `add the label “${r.value ?? ''}”` : 'mark it done';
  return `${when}, ${then}.`;
}
