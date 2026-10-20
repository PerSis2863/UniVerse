// Base58 (Bitcoin alphabet) and multibase "z…" strings (Stage 5 · Q14): how W3C Data Integrity
// proofs and Multikey public keys write bytes, e.g. a did:key-style "z6Mk…" Ed25519 key.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return '1'.repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join('');
}

export function base58Decode(text: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < text.length; i++) {
    const v = ALPHABET.indexOf(text[i]);
    if (v < 0) return null;
    let carry = v;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

/** Multibase base58btc: "z" then the base58 text. */
export const multibase = (bytes: Uint8Array) => `z${base58Encode(bytes)}`;
export const fromMultibase = (text: string) => (text.startsWith('z') ? base58Decode(text.slice(1)) : null);
