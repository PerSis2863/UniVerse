import { UnauthorizedException } from '@nestjs/common';
import { TokenAuthService } from './token-auth.service';

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === 'expired') throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
      if (token === 'good') return { uid: 'fb1', email: 'a@b.com', name: 'A' };
      throw new Error('bad token');
    },
  }),
}));

const users: any[] = [{ id: 'u1', email: 'demo@student.com', firebaseUid: null }, { id: 'u2', email: 'real@x.com', firebaseUid: 'fb1' }];
const prisma: any = {
  user: {
    findUnique: async ({ where }: any) => users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email) || (where.firebaseUid && u.firebaseUid === where.firebaseUid)) ?? null,
    update: async () => null,
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
});
