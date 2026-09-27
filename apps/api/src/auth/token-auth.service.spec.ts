import { UnauthorizedException } from '@nestjs/common';
import { TokenAuthService } from './token-auth.service';

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === 'expired') throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
      if (token === 'good') return { uid: 'fb1', email: 'a@b.com', name: 'A' };
      // Someone else registering with an existing account's email:
      if (token === 'claim-unverified') return { uid: 'fb-attacker', email: 'legacy@x.com', email_verified: false };
      if (token === 'claim-verified') return { uid: 'fb-legacy', email: 'legacy@x.com', email_verified: true };
      if (token === 'claim-linked') return { uid: 'fb-attacker', email: 'real@x.com', email_verified: true };
      throw new Error('bad token');
    },
  }),
}));

const users: any[] = [
  { id: 'u1', email: 'demo@student.com', firebaseUid: null },
  { id: 'u2', email: 'real@x.com', firebaseUid: 'fb1' },
  { id: 'u3', email: 'legacy@x.com', firebaseUid: null },
];
const prisma: any = {
  user: {
    findUnique: async ({ where }: any) => users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email) || (where.firebaseUid && u.firebaseUid === where.firebaseUid)) ?? null,
    update: async ({ where, data }: any) => ({ ...users.find((u) => u.email === where.email), ...data }),
    create: async ({ data }: any) => ({ id: 'new', ...data }),
  },
};

describe('TokenAuthService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const svc = new TokenAuthService(prisma);

  it('extracts bearer tokens', () => {
    expect(TokenAuthService.extractBearer('Bearer abc')).toBe('abc');
    expect(TokenAuthService.extractBearer('abc')).toBe('abc');
    expect(TokenAuthService.extractBearer('')).toBeNull();
    expect(TokenAuthService.extractBearer(undefined)).toBeNull();
  });

  it('accepts demo tokens only for allowlisted accounts when enabled', async () => {
    process.env.DEMO_LOGIN_ENABLED = 'true';
    await expect(svc.resolveUser('mock-token-demo@student.com')).resolves.toMatchObject({ id: 'u1' });
    await expect(svc.resolveUser('mock-token-real@x.com')).rejects.toBeInstanceOf(UnauthorizedException);
    process.env.DEMO_LOGIN_ENABLED = 'false';
    await expect(svc.resolveUser('mock-token-demo@student.com')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves Firebase users and reports expired tokens as 401', async () => {
    await expect(svc.resolveUser('good')).resolves.toMatchObject({ id: 'u2' });
    await expect(svc.resolveUser('expired')).rejects.toThrow('Authentication token expired');
    await expect(svc.resolveUser('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('links an existing account by email only when the email is verified', async () => {
    await expect(svc.resolveUser('claim-unverified')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.resolveUser('claim-verified')).resolves.toMatchObject({ id: 'u3', firebaseUid: 'fb-legacy' });
  });

  it('never re-links an account that already belongs to another sign-in', async () => {
    await expect(svc.resolveUser('claim-linked')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
