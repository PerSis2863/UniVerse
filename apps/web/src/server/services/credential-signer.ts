import { logger } from '../logger';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

/**
 * Signs and verifies impact credentials.
 *
 * Every issued credential is turned into a W3C Verifiable Credential document, serialized
 * canonically (sorted keys), hashed with SHA-256 and signed with the platform's Ed25519 key.
 * Anyone holding the public key (served at GET /api/verify/public-key) can check that a
 * credential was issued by UniVerse and has not been altered since.
 *
 * Key configuration:
 *   CREDENTIAL_SIGNING_PRIVATE_KEY  PKCS#8 PEM Ed25519 private key ("\n" escapes are accepted).
 *                                   Generate one with:  npm run credentials:keygen
 * In non-production environments a temporary key is generated if none is set (credentials
 * signed with it stop verifying after a restart). In production, signing refuses to run
 * without a configured key.
 */

export const SIGNATURE_ALG = 'Ed25519';
export const ISSUER_DID = 'did:universe:impact-platform';

export interface CredentialRecord {
  id: string;
  userId: string;
  certificateCode: string;
  title: string;
  projectName: string;
  organization: string;
  hoursCompleted: number;
  peopleImpacted: number;
  description: string | null;
  issuedAt: Date;
  verifiedByName: string | null;
}

export function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL || 'https://universeimpact.com').replace(/\/+$/, '');
}

export function verifyUrlFor(certificateId: string): string {
  return `${publicAppUrl()}/verify/${certificateId}`;
}

/** Deterministic JSON: object keys sorted recursively, undefined values dropped. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

/** Builds the W3C Verifiable Credential document. Only stored fields are used so it can be rebuilt exactly. */
export function buildCredentialPayload(cert: CredentialRecord, holderName: string): Record<string, unknown> {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'ImpactCredential'],
    id: verifyUrlFor(cert.id),
    issuer: ISSUER_DID,
    issuanceDate: new Date(cert.issuedAt).toISOString(),
    credentialSubject: {
      id: `did:universe:student:${cert.userId}`,
      name: holderName,
      certificateCode: cert.certificateCode,
      achievement: cert.title,
      project: cert.projectName,
      organization: cert.organization,
      hoursCompleted: cert.hoursCompleted,
      peopleImpacted: cert.peopleImpacted,
      description: cert.description ?? null,
      verifiedBy: cert.verifiedByName ?? null,
    },
  };
}

export function hashCanonical(canonical: string): string {
  return '0x' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export class CredentialSigner {
  private static readonly logger = logger;
  private static cached: { privateKey: KeyObject; publicKey: KeyObject; keyId: string; ephemeral: boolean } | null = null;

  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private static load() {
    if (this.cached) return this.cached;
    const raw = process.env.CREDENTIAL_SIGNING_PRIVATE_KEY;
    let privateKey: KeyObject;
    let ephemeral = false;
    if (raw && raw.trim()) {
      privateKey = createPrivateKey(raw.replace(/\\n/g, '\n').trim());
      if (privateKey.asymmetricKeyType !== 'ed25519') {
        throw new Error('CREDENTIAL_SIGNING_PRIVATE_KEY must be an Ed25519 private key');
      }
    } else {
      if (this.isProduction()) {
        throw new Error('CREDENTIAL_SIGNING_PRIVATE_KEY is not set; refusing to sign credentials in production');
      }
      privateKey = generateKeyPairSync('ed25519').privateKey;
      ephemeral = true;
      this.logger.warn(
        'CREDENTIAL_SIGNING_PRIVATE_KEY not set: using a temporary signing key. Credentials signed now will NOT verify after a restart. Run `npm run credentials:keygen`.',
      );
    }
    const publicKey = createPublicKey(privateKey);
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const keyId = createHash('sha256').update(der).digest('hex').slice(0, 16);
    this.cached = { privateKey, publicKey, keyId, ephemeral };
    return this.cached;
  }

  static sign(cert: CredentialRecord, holderName: string) {
    const { privateKey, keyId } = this.load();
    const payload = buildCredentialPayload(cert, holderName);
    const canonical = canonicalize(payload);
    const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
    return { payload, hash: hashCanonical(canonical), signature, keyId, alg: SIGNATURE_ALG };
  }

  /**
   * Rebuilds the payload from stored data and checks it against the stored hash and signature.
   * Returns which check failed so the verify page can explain the result.
   */
  static verify(
    cert: CredentialRecord & { blockchainHash: string | null; signature: string | null; signingKeyId: string | null },
    holderName: string,
  ) {
    const payload = buildCredentialPayload(cert, holderName);
    const canonical = canonicalize(payload);
    const hash = hashCanonical(canonical);
    const hashMatches = !!cert.blockchainHash && cert.blockchainHash === hash;
    let signatureValid = false;
    let knownKey = false;
    try {
      const { publicKey, keyId } = this.load();
      knownKey = cert.signingKeyId === keyId;
      if (cert.signature && knownKey) {
        signatureValid = cryptoVerify(null, Buffer.from(canonical, 'utf8'), publicKey, Buffer.from(cert.signature, 'base64url'));
      }
    } catch (e) {
      this.logger.error(`Signature verification unavailable: ${(e as Error).message}`);
    }
    return { payload, hash, hashMatches, signatureValid, knownKey };
  }

  static publicKeyInfo() {
    const { publicKey, keyId, ephemeral } = this.load();
    return {
      alg: SIGNATURE_ALG,
      keyId,
      issuer: ISSUER_DID,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      temporary: ephemeral,
    };
  }
}
