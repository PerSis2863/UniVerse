import { describe, expect, it } from 'vitest';
import { BUCKETS, WEIGHTS } from './relief-model.gen';
import { COLUMNS, features, readNeed } from './relief-model';

describe("Relief's own AI (M361)", () => {
  it('ships one weight per bucket and answer', () => {
    expect(atob(WEIGHTS).length).toBe(BUCKETS * COLUMNS.length);
  });

  it('reads the same words the same way every time, within the buckets', () => {
    const f = features('Urgent: water for 5 people');
    expect(f).toEqual(features('urgent water for 9 people'.replace('9', '5')));
    expect(f.every((b) => b >= 0 && b < BUCKETS)).toBe(true);
  });

  it('tells a life in danger from a request that can wait', () => {
    expect(readNeed('help!! grandpa is not breathing')).toMatchObject({ urgency: 'CRITICAL', kind: 'MEDICAL' });
    expect(readNeed('some books for the kids, whenever you can')).toMatchObject({ urgency: 'LOW' });
    expect(readNeed('we need drinking water tonight')).toMatchObject({ urgency: 'HIGH', kind: 'WATER' });
  });
});
