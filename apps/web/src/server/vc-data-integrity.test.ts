import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fromMultibase } from '@/lib/base58';
import { didDocument, didWeb, signCredential, verifyCredential } from './vc-data-integrity';

// The JSON Canonicalization Scheme as an outside verifier would write it (RFC 8785, for plain JSON).
const jcs = (v: unknown): string => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]`
  : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${jcs((v as Record<string, unknown>)[k])}`).join(',')}}`);

const doc = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: 'https://universeimpact.com/passport/skills/p1',
  type: ['VerifiableCredential', 'SkillsEvidenceCredential'],
  issuer: { id: didWeb(), name: 'UniVerse Impact' },
  validFrom: '2026-10-18T09:00:00Z',
  credentialSubject: { name: 'Ada Lovelace', skills: [{ name: 'Programming', evidence: 3, bestResult: '92%' }] },
};

describe('W3C VC 2.0 with Data Integrity (eddsa-jcs-2022)', () => {
  it('publishes the key as a did:web Multikey', () => {
    const d = didDocument();
    expect(d.id).toBe('did:web:universeimpact.com');
    expect(d.verificationMethod[0].publicKeyMultibase.startsWith('z6Mk')).toBe(true);
    expect(d.assertionMethod[0]).toBe(d.verificationMethod[0].id);
  });

  it('signs so that an independent verifier following the standard accepts it', () => {
    const vc = signCredential(doc, '2026-10-18T09:00:00Z')!;
    expect(vc.proof).toMatchObject({ type: 'DataIntegrityProof', cryptosuite: 'eddsa-jcs-2022', proofPurpose: 'assertionMethod', created: '2026-10-18T09:00:00Z' });
    // Verify from scratch: the key from the DID document, the hashes of the proof settings and the document.
    const { proof, ...unsecured } = vc as Record<string, unknown> & { proof: Record<string, unknown> };
    const { proofValue, ...config } = proof;
    const key = fromMultibase(didDocument().verificationMethod[0].publicKeyMultibase)!;
    expect([...key.slice(0, 2)]).toEqual([0xed, 0x01]);
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(key.slice(2)).toString('base64url') }, format: 'jwk' });
    const data = Buffer.concat([createHash('sha256').update(jcs(config)).digest(), createHash('sha256').update(jcs(unsecured)).digest()]);
    expect(verify(null, data, publicKey, Buffer.from(fromMultibase(proofValue as string)!))).toBe(true);
    expect(verifyCredential(vc)).toMatchObject({ ok: true });
  });

  it('refuses a changed credential, a changed proof, and things that aren’t credentials', () => {
    const vc = signCredential(doc)!;
    const changed = { ...vc, credentialSubject: { ...vc.credentialSubject, name: 'Someone Else' } };
    expect(verifyCredential(changed)).toMatchObject({ ok: false });
    expect(verifyCredential({ ...vc, proof: { ...vc.proof, created: '2020-01-01T00:00:00Z' } })).toMatchObject({ ok: false });
    expect(verifyCredential({ ...vc, proof: { ...vc.proof, verificationMethod: 'did:web:evil.example#k' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/someone else/) });
    expect(verifyCredential({ ...vc, proof: { ...vc.proof, cryptosuite: 'eddsa-rdfc-2022' } })).toMatchObject({ ok: false });
    expect(verifyCredential('nope')).toMatchObject({ ok: false });
    expect(verifyCredential([vc])).toMatchObject({ ok: false });
  });
});
