import { createHash } from 'node:crypto';
import { fromMultibase, multibase } from '@/lib/base58';
import { canonicalize, CredentialSigner, publicAppUrl } from './services/credential-signer';

// W3C Verifiable Credentials 2.0 with a Data Integrity proof (Stage 5 · Q14), the kind digital
// wallets keep: the site is the issuer as a did:web identifier (its DID document, with the signing
// key as a Multikey, is at /.well-known/did.json), and a credential is signed with the
// "eddsa-jcs-2022" cryptosuite: the proof's settings and the credential are each written in the
// JSON Canonicalization Scheme (keys sorted; `canonicalize`), hashed with SHA-256, and the two
// hashes signed with Ed25519. Anyone can check it with any tool that knows the standard.

export const CRYPTOSUITE = 'eddsa-jcs-2022';
const ED25519_PUB = [0xed, 0x01]; // the multicodec prefix of an Ed25519 public key

/** The site as a did:web identifier ("did:web:universeimpact.com"; a port's colon is written %3A). */
export const didWeb = () => `did:web:${encodeURIComponent(new URL(publicAppUrl()).host)}`;

/** The site's DID document: who signs its credentials, and with which key. */
export function didDocument() {
  const { raw, keyId } = CredentialSigner.rawPublicKey();
  const did = didWeb();
  const vm = `${did}#${keyId}`;
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
    id: did,
    verificationMethod: [{ id: vm, type: 'Multikey', controller: did, publicKeyMultibase: multibase(Uint8Array.from([...ED25519_PUB, ...raw])) }],
    assertionMethod: [vm],
    authentication: [vm],
  };
}

const sha256 = (text: string) => new Uint8Array(createHash('sha256').update(text, 'utf8').digest());
const hashData = (config: Record<string, unknown>, doc: Record<string, unknown>) => Uint8Array.from([...sha256(canonicalize(config)), ...sha256(canonicalize(doc))]);

type Doc = Record<string, unknown> & { '@context': unknown };

/** The credential with its proof, or null when there's no signing key. */
export function signCredential<T extends Doc>(doc: T, created = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')): (T & { proof: Record<string, unknown> }) | null {
  const keyId = CredentialSigner.rawPublicKey().keyId;
  const config = { '@context': doc['@context'], type: 'DataIntegrityProof', cryptosuite: CRYPTOSUITE, created, verificationMethod: `${didWeb()}#${keyId}`, proofPurpose: 'assertionMethod' };
  const signed = CredentialSigner.signBytes(hashData(config, doc));
  return signed ? { ...doc, proof: { ...config, proofValue: multibase(signed.signature) } } : null;
}

/** Checks a credential this site signed: the cryptosuite, that it's this site's key, and the signature. */
export function verifyCredential(secured: unknown): { ok: true; doc: Doc } | { ok: false; reason: string } {
  if (!secured || typeof secured !== 'object' || Array.isArray(secured)) return { ok: false, reason: 'That isn’t a credential file.' };
  const { proof, ...doc } = secured as Record<string, unknown>;
  const p = proof as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object' || p.type !== 'DataIntegrityProof' || p.cryptosuite !== CRYPTOSUITE || typeof p.proofValue !== 'string') return { ok: false, reason: 'This credential has no proof UniVerse can check.' };
  if (p.proofPurpose !== 'assertionMethod' || p.verificationMethod !== `${didWeb()}#${CredentialSigner.rawPublicKey().keyId}`) return { ok: false, reason: 'This credential was signed by someone else, or with an old key.' };
  const { proofValue, ...config } = p;
  if (config['@context'] !== undefined && canonicalize(config['@context']) !== canonicalize(doc['@context'])) return { ok: false, reason: 'The signature doesn’t match. The credential was changed.' };
  const signature = fromMultibase(proofValue as string);
  if (!signature || signature.length !== 64 || !CredentialSigner.verifyBytes(hashData(config, doc), signature)) return { ok: false, reason: 'The signature doesn’t match. The credential was changed, or it wasn’t issued by UniVerse.' };
  return { ok: true, doc: doc as Doc };
}
