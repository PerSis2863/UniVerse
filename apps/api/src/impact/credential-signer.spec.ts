import { generateKeyPairSync } from 'crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { canonicalize, CredentialSigner, hashCanonical, buildCredentialPayload } from './credential-signer';
import { RequestCredentialDto } from './dto/credential.dto';

const baseCert = {
  id: 'cert_1',
  userId: 'user_1',
  certificateCode: 'UNI-ABC-123456',
  title: 'Clean Water Champion',
  projectName: 'Clean Water Initiative',
  organization: 'WaterAid Kenya',
  hoursCompleted: 40,
  peopleImpacted: 500,
  description: null as string | null,
  issuedAt: new Date('2026-09-24T10:00:00.123Z'),
  verifiedByName: 'Admin User',
};

function resetSigner(env: Record<string, string | undefined>) {
  (CredentialSigner as any).cached = null;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('canonicalize', () => {
  it('is independent of key order', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      canonicalize({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
  });
  it('drops undefined but keeps null', () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('CredentialSigner', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    (CredentialSigner as any).cached = null;
  });

  it('signs and verifies a credential round trip', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    resetSigner({ CREDENTIAL_SIGNING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    const signed = CredentialSigner.sign(baseCert, 'Sarah K');
    expect(signed.hash).toBe(hashCanonical(canonicalize(buildCredentialPayload(baseCert, 'Sarah K'))));
    const check = CredentialSigner.verify(
      { ...baseCert, blockchainHash: signed.hash, signature: signed.signature, signingKeyId: signed.keyId },
      'Sarah K',
    );
    expect(check).toMatchObject({ hashMatches: true, signatureValid: true, knownKey: true });
  });

  it('accepts a key with escaped newlines (as stored in hosting dashboards)', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim().replace(/\n/g, '\\n');
    resetSigner({ CREDENTIAL_SIGNING_PRIVATE_KEY: pem });
    expect(CredentialSigner.publicKeyInfo().temporary).toBe(false);
  });

  it('detects tampering with any field', () => {
    resetSigner({ CREDENTIAL_SIGNING_PRIVATE_KEY: undefined, NODE_ENV: 'test' });
    const signed = CredentialSigner.sign(baseCert, 'Sarah K');
    const stored = { ...baseCert, blockchainHash: signed.hash, signature: signed.signature, signingKeyId: signed.keyId };
    expect(CredentialSigner.verify({ ...stored, hoursCompleted: 400 }, 'Sarah K').hashMatches).toBe(false);
    expect(CredentialSigner.verify(stored, 'Someone Else').hashMatches).toBe(false);
    // Attacker recomputes the hash but cannot produce a valid signature.
    const forged = { ...stored, hoursCompleted: 400 };
    forged.blockchainHash = hashCanonical(canonicalize(buildCredentialPayload(forged, 'Sarah K')));
    const check = CredentialSigner.verify(forged, 'Sarah K');
    expect(check.hashMatches).toBe(true);
    expect(check.signatureValid).toBe(false);
  });

  it('refuses to sign in production without a configured key', () => {
    resetSigner({ CREDENTIAL_SIGNING_PRIVATE_KEY: undefined, NODE_ENV: 'production' });
    expect(() => CredentialSigner.sign(baseCert, 'Sarah K')).toThrow(/CREDENTIAL_SIGNING_PRIVATE_KEY/);
  });

  it('rejects non-Ed25519 keys', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    resetSigner({ CREDENTIAL_SIGNING_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    expect(() => CredentialSigner.sign(baseCert, 'x')).toThrow(/Ed25519/);
  });
});

describe('RequestCredentialDto validation', () => {
  const valid = {
    title: 'Clean Water Champion',
    projectName: 'Clean Water Initiative',
    organization: 'WaterAid',
    hoursCompleted: 40,
    peopleImpacted: 500,
  };
  it('accepts a valid request', async () => {
    expect(await validate(plainToInstance(RequestCredentialDto, valid))).toHaveLength(0);
  });
  it('rejects negative hours and bad evidence URLs', async () => {
    const errors = await validate(plainToInstance(RequestCredentialDto, { ...valid, hoursCompleted: -1, evidenceUrl: 'not a url' }));
    expect(errors.map((e) => e.property).sort()).toEqual(['evidenceUrl', 'hoursCompleted']);
  });
});
