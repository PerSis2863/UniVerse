import { describe, expect, it } from 'vitest';
import { cleanPlan, localPlan } from './ask';

describe('Ask UniVerse', () => {
  it('keeps a valid climate action and works out its CO₂', () => {
    const p = cleanPlan({ action: 'green_log', kind: 'cycle', amount: '8' });
    expect(p).toMatchObject({ action: 'green_log', kind: 'CYCLE', amount: 8 });
    expect(p.say).toContain('1.6 kg');
  });
  it('turns anything unsafe or out of range into a plain answer', () => {
    expect(cleanPlan({ action: 'green_log', kind: 'CYCLE', amount: 99999 }).action).toBe('answer');
    expect(cleanPlan({ action: 'delete_everything' }).action).toBe('answer');
    expect(cleanPlan({ action: 'open', page: 'console' }).action).toBe('answer');
    expect(cleanPlan({ action: 'trace_check', code: 'not-a-code' }).action).toBe('answer');
    expect(cleanPlan(null).action).toBe('answer');
  });
  it('matches common requests without AI', () => {
    expect(localPlan('I cycled 12 km to school')).toMatchObject({ action: 'green_log', kind: 'CYCLE', amount: 12 });
    expect(localPlan('We need drinking water for 4 people, urgent')).toMatchObject({ action: 'relief_post', type: 'NEED', kind: 'WATER', people: 4, urgency: 'HIGH' });
    expect(localPlan('I can offer a lift to the clinic')).toMatchObject({ action: 'relief_post', type: 'OFFER', kind: 'TRANSPORT' });
    expect(localPlan('open my wallet')).toMatchObject({ action: 'open', page: 'hub' });
    expect(localPlan('what is the weather').action).toBe('answer');
  });
});
