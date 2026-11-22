import { describe, expect, it } from 'vitest';
import { cleanPlan, localPlan } from './ask';

describe('Ghidra, the assistant (Ask UniVerse until M422)', () => {
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
  it('M422: reads the person’s own work and Green numbers, and opens the new pages', () => {
    expect(localPlan('What’s due this week?').action).toBe('my_due');
    expect(localPlan('any homework for tomorrow').action).toBe('my_due');
    expect(localPlan('How am I doing in Green?').action).toBe('my_green');
    expect(localPlan('what is my streak').action).toBe('my_green');
    expect(localPlan('I cycled 5 km').action).toBe('green_log');
    expect(localPlan('take me to my trips')).toMatchObject({ action: 'open', page: 'travel' });
    expect(localPlan('open games')).toMatchObject({ action: 'open', page: 'games' });
    expect(cleanPlan({ action: 'my_due', say: 'x' }).action).toBe('my_due');
    expect(cleanPlan({ action: 'show', items: [{ title: 'made up' }] }).action).toBe('answer'); // a list only ever comes from the server's own read
  });
  it('M424: lists trips and courses, starts a trip, drafts a message, and checks what AI gives', () => {
    expect(localPlan('What trips do I have?').action).toBe('my_trips');
    expect(localPlan('which are my courses').action).toBe('my_courses');
    expect(localPlan('Plan a trip to Jaipur for 3 of us')).toMatchObject({ action: 'trip_new', name: 'Trip to Jaipur', travellers: 3 });
    expect(cleanPlan({ action: 'trip_new', name: 'Trip to Goa', startDate: '2026-12-20', travellers: 4 })).toMatchObject({ startDate: '2026-12-20', travellers: 4 });
    expect(cleanPlan({ action: 'trip_new', name: 'Trip to Goa', startDate: 'next friday', travellers: 99 })).toMatchObject({ startDate: null, travellers: 1 });
    expect(cleanPlan({ action: 'trip_new', name: 'x' }).action).toBe('answer');
    expect(cleanPlan({ action: 'message_draft', text: 'The meeting moved to 4 pm.' })).toMatchObject({ action: 'message_draft', text: 'The meeting moved to 4 pm.' });
    expect(cleanPlan({ action: 'message_draft', text: '' }).action).toBe('answer');
    expect((cleanPlan({ action: 'message_draft', text: 'a'.repeat(5000) }) as { text: string }).text.length).toBe(1000);
  });
  it('M425: a teacher’s quiz draft, with the course left for the server to find', () => {
    expect(localPlan('Make a quiz on fractions for MATH7')).toMatchObject({ action: 'quiz_draft', topic: 'fractions', course: 'MATH7', count: 5 });
    expect(localPlan('write a quiz with 8 questions about the water cycle')).toMatchObject({ action: 'quiz_draft', topic: 'the water cycle', count: 8, course: null });
    expect(localPlan('what quizzes are due').action).toBe('my_due');
    const p = cleanPlan({ action: 'quiz_draft', topic: 'photosynthesis', count: 99, courseId: 'someone-elses-course' });
    expect(p).toMatchObject({ action: 'quiz_draft', topic: 'photosynthesis', count: 5 });
    expect((p as { courseId?: string }).courseId).toBeUndefined(); // only the server sets the course, from the teacher's own
  });
});
