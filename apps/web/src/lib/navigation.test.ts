import { describe, expect, it } from 'vitest';
import { routesOf, withRecent, keptOf, directionsUrl, type Route } from './map-tools';
import { bannerDistance, bearingOf, bubbleSpot, cueAt, cueText, eta, followZoom, hasArrived, headingAt, isOff, planOf, pointAt, progressAt, sayDistance, snapTo, turnSign, turnToward } from './navigation';

// An L-shaped walk in Helsinki: about 556 m north, then about 556 m east (0.005° of latitude, 0.01° of longitude at 60°).
const A: [number, number] = [24.94, 60.17], B: [number, number] = [24.94, 60.175], C: [number, number] = [24.95, 60.175];
const answer = { code: 'Ok', routes: [{ duration: 800, distance: 1110, geometry: { coordinates: [A, B, C] }, legs: [{ steps: [
  { name: 'Mannerheimintie', distance: 556, duration: 400, maneuver: { type: 'depart', location: A } },
  { name: 'Esplanadi', distance: 554, duration: 400, maneuver: { type: 'turn', modifier: 'right', location: B } },
  { name: '', distance: 0, duration: 0, maneuver: { type: 'arrive', location: C } },
] }] }] };
const route: Route = routesOf(answer)[0];
const plan = planOf(route);

describe('live navigation (M260)', () => {
  it('reads the turns with where they are and how long they take', () => {
    expect(route.steps.map((s) => [s.type, s.mod, s.sec])).toEqual([['depart', '', 400], ['turn', 'right', 400], ['arrive', '', 0]]);
    expect(route.steps[1].at).toEqual(B);
  });
  it('places the turns on the line', () => {
    expect(plan.total).toBeGreaterThan(1100);
    expect(plan.total).toBeLessThan(1120);
    expect(plan.steps[1].along).toBeCloseTo(556, -1);
    expect(plan.steps[2].along).toBe(plan.total);
    expect(plan.sec).toBe(800);
  });
  it('snaps a position to the route, and says how far off it is', () => {
    const s = snapTo(plan, { lat: 60.1725, lon: 24.9402 }); // 11 m east of the first street, half way up
    expect(s.along).toBeCloseTo(278, -1);
    expect(s.off).toBeCloseTo(11, 0);
    expect(pointAt(plan, plan.total / 2)[1]).toBeCloseTo(60.175, 3);
    expect(bearingOf(A, B)).toBeCloseTo(0, 0);
    expect(headingAt(plan, 100)).toBeCloseTo(0, 0);
    expect(headingAt(plan, 800)).toBeCloseTo(90, 0);
  });
  it('keeps to the part already reached when the route passes the same place twice', () => {
    const back = planOf({ path: [A, B, A], minutes: 10, km: 1.1, steps: [] });
    expect(snapTo(back, { lat: 60.171, lon: 24.94 }, 900).along).toBeGreaterThan(900);
    expect(snapTo(back, { lat: 60.171, lon: 24.94 }).along).toBeLessThan(200);
  });
  it('counts down to the next turn and what is left', () => {
    const p = progressAt(plan, 300);
    expect(p.next).toBe(1);
    expect(p.toNext).toBeCloseTo(256, -1);
    expect(p.leftSec).toBeCloseTo(400 * (256 / 556) + 400, -1);
    const q = progressAt(plan, 700);
    expect([q.cur, q.next]).toEqual([1, 2]);
    expect(q.leftM).toBeCloseTo(plan.total - 700, 0);
    const now = Date.UTC(2026, 10, 17, 12, 0);
    expect(eta(now, 600).min).toBe(10);
    expect(eta(now, 600).at.getTime()).toBe(now + 600_000);
  });
  it('knows when you have left the route and when you have arrived', () => {
    expect(isOff(25, 5, 'foot')).toBe(false);
    expect(isOff(40, 5, 'foot')).toBe(true);
    expect(isOff(40, 50, 'foot')).toBe(false); // the phone is unsure: wait
    expect(isOff(40, 5, 'car')).toBe(false);
    expect(hasArrived(progressAt(plan, plan.total - 10), 5, 'foot')).toBe(true);
    expect(hasArrived(progressAt(plan, plan.total - 10), 80, 'foot')).toBe(false);
  });
  it('says each instruction once, at the right distance', () => {
    const said = new Set<string>();
    const go = cueAt('foot', progressAt(plan, 10), said)!;
    expect(go.kind).toBe('go');
    expect(cueText(plan, progressAt(plan, 10), 'go')).toBe('Head off along Mannerheimintie for 550 metres, then turn right onto Esplanadi');
    said.add(go.key);
    expect(cueAt('foot', progressAt(plan, 200), said)).toBeNull();
    const early = cueAt('foot', progressAt(plan, 450), said)!;
    expect(early.kind).toBe('early');
    expect(cueText(plan, progressAt(plan, 450), 'early')).toBe('In 100 metres, turn right onto Esplanadi');
    said.add(early.key);
    const now = cueAt('foot', progressAt(plan, 540), said)!;
    expect(cueText(plan, progressAt(plan, 540), now.kind)).toBe('Turn right onto Esplanadi');
    said.add(now.key);
    expect(cueText(plan, progressAt(plan, plan.total - 50), 'early')).toBe('Your destination is in 50 metres');
    expect(sayDistance(1460)).toBe('1.5 kilometres');
    expect(sayDistance(43)).toBe('40 metres');
  });
  it('draws the right arrow, counts the banner down and follows smoothly', () => {
    expect(turnSign('turn', 'sharp left')).toEqual({ angle: -135 });
    expect(turnSign('fork', 'slight right')).toEqual({ angle: 45 });
    expect(turnSign('continue', 'straight')).toEqual({ angle: 0 });
    expect(turnSign('roundabout', 'right')).toEqual({ sign: 'roundabout' });
    expect(turnSign('turn', 'uturn')).toEqual({ sign: 'uturn' });
    expect(bannerDistance(347)).toBe('350 m');
    expect(bannerDistance(42)).toBe('40 m');
    expect(bannerDistance(2340)).toBe('2.3 km');
    expect(turnToward(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(followZoom('car', 30, 1000)).toBeLessThan(followZoom('car', 5, 1000));
  });
  it('asks for stops on the way and roads to leave out, and reads every stretch', () => {
    const u = directionsUrl('car', { lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { via: [{ lat: 5, lon: 6 }], avoid: 'toll' });
    expect(u).toContain('2.00000,1.00000;6.00000,5.00000;4.00000,3.00000');
    expect(u).toContain('alternatives=false&exclude=toll');
    expect(directionsUrl('foot', { lat: 1, lon: 2 }, { lat: 3, lon: 4 }, { avoid: 'toll' })).not.toContain('exclude');
    const two = routesOf({ code: 'Ok', routes: [{ duration: 60, distance: 100, geometry: { coordinates: [A, B, C] }, legs: [
      { steps: [{ maneuver: { type: 'depart' } }, { maneuver: { type: 'arrive' } }] },
      { steps: [{ maneuver: { type: 'depart' } }, { maneuver: { type: 'roundabout', modifier: 'right', exit: 2 }, name: 'Ring' }, { maneuver: { type: 'arrive' } }] },
    ] }] })[0];
    expect(two.steps.map((s) => s.text)).toEqual(['Head off', 'You have reached your stop', 'At the roundabout, take the second exit onto Ring', 'You have arrived']);
    expect(two.steps[1].type).toBe('stop');
  });
  it('keeps the places looked up, each once, the newest first', () => {
    let k = keptOf(null);
    for (const n of ['A', 'B', 'A', 'Your location']) k = withRecent(k, { lat: 1, lon: 1, name: n });
    expect(k.recent.map((x) => x.name)).toEqual(['A', 'B']);
    expect(keptOf({ home: { lat: 99, lon: 0, name: 'x' }, work: { lat: 1, lon: 2, name: 'Office' } })).toEqual({ home: undefined, work: { lat: 1, lon: 2, name: 'Office' }, recent: [] });
  });
  it('puts each route’s time on its own stretch', () => {
    const main: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], alt: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]];
    expect(bubbleSpot(alt, [main])).toEqual([2, 2]);
  });
});
