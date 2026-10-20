import { describe, expect, it } from 'vitest';
import { ballotListText, budgetSummary, cleanCandidates, cleanListing, cleanOrderItems, dishesOf, electionState, pickupOk, prepList, sectionOf, tally, ticketPrice } from './student-life';

const NOW = Date.UTC(2026, 9, 19, 9);

describe('tickets', () => {
  it('reads prices', () => {
    expect(ticketPrice('150')).toBe(15000);
    expect(ticketPrice('')).toBe(null);
    expect(ticketPrice(0)).toBe(null);
    expect(ticketPrice('abc')).toBe(null);
  });
});

describe('club elections', () => {
  it('takes 2–10 distinct candidates', () => {
    expect(cleanCandidates(['Asha', 'asha ', 'Ben'])).toEqual([{ id: 'c1', name: 'Asha' }, { id: 'c2', name: 'Ben' }]);
    expect(cleanCandidates(['Only'])).toBe(null);
  });
  it('knows when an election is open and counts it', () => {
    const e = { opensAt: new Date(NOW - 1000), closesAt: new Date(NOW + 1000) };
    expect(electionState(e, NOW)).toBe('OPEN');
    expect(electionState(e, NOW + 2000)).toBe('CLOSED');
    const c = [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }];
    expect(tally(c, [{ choice: 'c2' }, { choice: 'c2' }, { choice: 'c1' }])).toMatchObject({ total: 3, winners: ['c2'] });
    expect(tally(c, [{ choice: 'c1' }, { choice: 'c2' }]).winners).toEqual(['c1', 'c2']);
    expect(ballotListText([{ receipt: 'ZZ', choice: 'c1' }, { receipt: 'AA', choice: 'c2' }])).toBe('AA:c2\nZZ:c1');
  });
});

describe('club budgets', () => {
  it('adds up', () => {
    expect(budgetSummary(500_000, [{ kind: 'INCOME', amount: 20_000 }, { kind: 'EXPENSE', amount: 120_000 }])).toEqual({ budget: 500_000, income: 20_000, spent: 120_000, left: 400_000 });
  });
});

describe('campus board', () => {
  it('checks each kind of post', () => {
    expect(sectionOf('RIDE_WANT')).toBe('rides');
    expect(cleanListing({ kind: 'SELL', title: 'Calculus book', price: '' }, NOW)).toEqual({ ok: false, error: 'Add a price (or post it as free).' });
    const sell = cleanListing({ kind: 'SELL', title: 'Calculus book', price: '350', category: 'Books' }, NOW);
    expect(sell.ok && sell.data.price).toBe(35000);
    const ride = cleanListing({ kind: 'RIDE_OFFER', title: 'To the airport', fromPlace: 'Campus', toPlace: 'Airport', departAt: new Date(NOW + 86_400_000).toISOString(), seats: 3 }, NOW);
    expect(ride.ok && (ride.data.expiresAt as Date).getTime()).toBe(NOW + 2 * 86_400_000);
    expect(cleanListing({ kind: 'RIDE_OFFER', title: 'Ride', fromPlace: 'A', toPlace: 'B', departAt: new Date(NOW + 86_400_000).toISOString(), seats: 0 }, NOW).ok).toBe(false);
    expect(cleanListing({ kind: 'ROOM_OFFER', title: 'Room near gate 2', area: 'Koramangala' }, NOW)).toEqual({ ok: false, error: 'Add the monthly rent.' });
    expect(cleanListing({ kind: 'HACK', title: 'x' }, NOW).ok).toBe(false);
  });
});

describe('cafeteria pre-orders', () => {
  const dishes = dishesOf('- Lentil curry (vegan)\nRice\n\n• Paneer wrap');
  it('reads the menu and the order', () => {
    expect(dishes).toEqual(['Lentil curry (vegan)', 'Rice', 'Paneer wrap']);
    expect(cleanOrderItems([{ dish: 'Rice', qty: 2 }, { dish: 'Rice', qty: 1 }, { dish: 'Pizza', qty: 1 }, { dish: 'Paneer wrap', qty: 9 }], dishes)).toEqual([{ dish: 'Rice', qty: 3 }]);
    expect(cleanOrderItems([], dishes)).toBe(null);
  });
  it('takes pickups on the menu’s day, not too soon', () => {
    const day = new Date(NOW); // the menu is stored at noon of its day
    expect(pickupOk(day, new Date(NOW + 3_600_000), NOW)).toBe(true);
    expect(pickupOk(day, new Date(NOW + 5 * 60_000), NOW)).toBe(false);
    expect(pickupOk(day, new Date(NOW + 30 * 3_600_000), NOW)).toBe(false);
    expect(prepList([{ status: 'PLACED', items: [{ dish: 'Rice', qty: 2 }] }, { status: 'CANCELLED', items: [{ dish: 'Rice', qty: 5 }] }, { status: 'READY', items: [{ dish: 'Rice', qty: 1 }, { dish: 'Dal', qty: 1 }] }])).toEqual([{ dish: 'Rice', qty: 3 }, { dish: 'Dal', qty: 1 }]);
  });
});
