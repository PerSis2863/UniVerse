// M342 (the owner, 19 Nov: "encrypted system in this also"): a call's security code. Direct (person to person) calls are
// encrypted end to end by WebRTC: each browser's DTLS certificate fingerprint is in the connection details (SDP) the
// call server passes on. If both people see the same code (made from both fingerprints, in a fixed order), nobody
// swapped the details in between: the call really is only between their two devices (Signal's and FaceTime's idea).

/** The certificate fingerprints in an SDP, as "sha-256 AB:CD:…". */
export function fingerprints(sdp: string | undefined | null): string[] {
  return [...new Set([...(sdp ?? '').matchAll(/^a=fingerprint:(\S+) ([0-9A-Fa-f:]+)\s*$/gm)].map((m) => `${m[1].toLowerCase()} ${m[2].toUpperCase()}`))];
}

/** Four groups of four digits, the same on both ends of one connection; null without both fingerprints. */
export async function securityCode(localSdp: string | undefined | null, remoteSdp: string | undefined | null): Promise<string | null> {
  const a = fingerprints(localSdp), b = fingerprints(remoteSdp);
  if (!a.length || !b.length) return null;
  const both = [a.join(','), b.join(',')].sort().join('|');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`uv-call-code:${both}`)));
  return [0, 1, 2, 3].map((i) => String(((hash[i * 2] << 8) | hash[i * 2 + 1]) % 10000).padStart(4, '0')).join(' ');
}
