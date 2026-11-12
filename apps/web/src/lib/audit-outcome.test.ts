import { describe, expect, it } from 'vitest';
import { outcomeOf } from './audit-outcome';

describe('outcomeOf', () => {
  it('colours an action by what came of it, in its own words', () => {
    expect(outcomeOf('credential.approved')).toEqual({ tone: 'green', label: 'Approved' });
    expect(outcomeOf('user.deleted')).toEqual({ tone: 'red', label: 'Deleted' });
    expect(outcomeOf('safety.flagged')).toEqual({ tone: 'amber', label: 'Flagged' });
    expect(outcomeOf('user.role_changed')).toEqual({ tone: 'blue', label: 'Role changed' });
    expect(outcomeOf('weird')).toEqual({ tone: 'blue', label: 'Done' });
  });
});
