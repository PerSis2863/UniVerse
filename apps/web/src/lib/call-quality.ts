// Call quality in numbers (Stage 5 · B8.1): from a connection's WebRTC stats, the round trip, packet
// loss since the last reading, jitter, and how fast media goes in and out; and a grade that matches
// the signal icon on each tile (poor: over 400 ms or 8 % loss; fair: over 200 ms or 3 %).

export interface Reading { rttMs: number | null; lossPct: number; jitterMs: number | null; inKbps: number; outKbps: number; relay: boolean }
export interface Snapshot { at: number; bytesIn: number; bytesOut: number; lost: number; got: number }
type Stat = Record<string, unknown> & { type?: string; id?: string };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** One reading from a stats report (`entries`: its values), compared with the previous snapshot. */
export function readStats(entries: Iterable<Stat>, prev: Snapshot | undefined, at: number): { reading: Reading; snapshot: Snapshot } {
  const all = [...entries];
  const byId = new Map(all.map((s) => [String(s.id ?? ''), s]));
  let rtt: number | null = null, jitter: number | null = null, relay = false;
  const snap: Snapshot = { at, bytesIn: 0, bytesOut: 0, lost: 0, got: 0 };
  for (const s of all) {
    if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || rtt === null) && typeof s.currentRoundTripTime === 'number') {
      rtt = s.currentRoundTripTime;
      relay = (byId.get(String(s.localCandidateId)) as Stat | undefined)?.candidateType === 'relay';
    }
    if (s.type === 'inbound-rtp') {
      snap.bytesIn += num(s.bytesReceived); snap.lost += num(s.packetsLost); snap.got += num(s.packetsReceived);
      if (typeof s.jitter === 'number') jitter = Math.max(jitter ?? 0, s.jitter);
    }
    if (s.type === 'outbound-rtp') snap.bytesOut += num(s.bytesSent);
  }
  const secs = prev ? Math.max(0.001, (at - prev.at) / 1000) : 0;
  const kbps = (now: number, before: number) => (prev && now >= before ? Math.round(((now - before) * 8) / 1000 / secs) : 0);
  const dLost = prev ? Math.max(0, snap.lost - prev.lost) : 0, dGot = prev ? Math.max(0, snap.got - prev.got) : 0;
  return {
    reading: {
      rttMs: rtt === null ? null : Math.round(rtt * 1000),
      lossPct: dGot + dLost ? Math.round((dLost / (dLost + dGot)) * 1000) / 10 : 0,
      jitterMs: jitter === null ? null : Math.round(jitter * 1000),
      inKbps: kbps(snap.bytesIn, prev?.bytesIn ?? 0),
      outKbps: kbps(snap.bytesOut, prev?.bytesOut ?? 0),
      relay,
    },
    snapshot: snap,
  };
}

export type Grade = 'good' | 'fair' | 'poor' | null;
export const grade = (r: Pick<Reading, 'rttMs' | 'lossPct'> | null): Grade =>
  !r || r.rttMs === null ? null : r.rttMs > 400 || r.lossPct > 8 ? 'poor' : r.rttMs > 200 || r.lossPct > 3 ? 'fair' : 'good';

/** My connection overall: the worst round trip and loss, and everything in and out added up. */
export function combine(readings: Reading[]): Reading | null {
  if (!readings.length) return null;
  const rtts = readings.map((r) => r.rttMs).filter((x): x is number => x !== null);
  const jit = readings.map((r) => r.jitterMs).filter((x): x is number => x !== null);
  return {
    rttMs: rtts.length ? Math.max(...rtts) : null,
    lossPct: Math.max(...readings.map((r) => r.lossPct)),
    jitterMs: jit.length ? Math.max(...jit) : null,
    inKbps: readings.reduce((n, r) => n + r.inKbps, 0),
    outKbps: readings.reduce((n, r) => n + r.outKbps, 0),
    relay: readings.some((r) => r.relay),
  };
}

/** "1.2 Mbps" / "640 kbps". */
export const rate = (kbps: number) => (kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`);

export const CALL_ISSUES = [
  { id: 'audio', label: 'Couldn’t hear well' },
  { id: 'video', label: 'Video froze or was blurry' },
  { id: 'lag', label: 'Delay or echo' },
  { id: 'dropped', label: 'I got cut off' },
  { id: 'join', label: 'Hard to join' },
] as const;
export const isCallIssue = (x: unknown): x is (typeof CALL_ISSUES)[number]['id'] => CALL_ISSUES.some((i) => i.id === x);
