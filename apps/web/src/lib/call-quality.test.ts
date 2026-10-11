import { describe, expect, it } from 'vitest';
import { combine, grade, rate, readStats } from './call-quality';

const report = (bytesIn: number, bytesOut: number, lost: number, got: number, rtt = 0.12, relay = false) => [
  { type: 'candidate-pair', id: 'cp', state: 'succeeded', nominated: true, currentRoundTripTime: rtt, localCandidateId: 'lc' },
  { type: 'local-candidate', id: 'lc', candidateType: relay ? 'relay' : 'host' },
  { type: 'inbound-rtp', id: 'a', bytesReceived: bytesIn / 2, packetsLost: lost, packetsReceived: got, jitter: 0.012 },
  { type: 'inbound-rtp', id: 'v', bytesReceived: bytesIn / 2, packetsLost: 0, packetsReceived: 0 },
  { type: 'outbound-rtp', id: 'o', bytesSent: bytesOut },
];

describe('call quality', () => {
  it('reads rates and loss between two readings', () => {
    const first = readStats(report(0, 0, 0, 0), undefined, 0);
    expect(first.reading).toMatchObject({ rttMs: 120, inKbps: 0, outKbps: 0, lossPct: 0 });
    const second = readStats(report(500_000, 250_000, 5, 95, 0.12, true), first.snapshot, 4000);
    expect(second.reading).toEqual({ rttMs: 120, lossPct: 5, jitterMs: 12, inKbps: 1000, outKbps: 500, relay: true });
  });
  it('grades like the tiles do', () => {
    expect(grade({ rttMs: 120, lossPct: 1 })).toBe('good');
    expect(grade({ rttMs: 250, lossPct: 1 })).toBe('fair');
    expect(grade({ rttMs: 100, lossPct: 9 })).toBe('poor');
    expect(grade(null)).toBeNull();
  });
  it('adds up my connections and shows rates', () => {
    const r = combine([
      { rttMs: 100, lossPct: 1, jitterMs: 5, inKbps: 300, outKbps: 200, relay: false },
      { rttMs: 300, lossPct: 4, jitterMs: null, inKbps: 900, outKbps: 200, relay: true },
    ]);
    expect(r).toEqual({ rttMs: 300, lossPct: 4, jitterMs: 5, inKbps: 1200, outKbps: 400, relay: true });
    expect(combine([])).toBeNull();
    expect([rate(640), rate(1250)]).toEqual(['640 kbps', '1.3 Mbps']);
  });
});
