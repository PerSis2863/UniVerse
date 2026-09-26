import { isDemoAccount, isDemoLoginEnabled } from './demo-accounts';

describe('demo accounts', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  it('is disabled in production unless explicitly enabled', () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(isDemoLoginEnabled()).toBe(false);
    process.env.DEMO_LOGIN_ENABLED = 'true';
    expect(isDemoLoginEnabled()).toBe(true);
  });

  it('is enabled in development by default and can be turned off', () => {
    delete process.env.DEMO_LOGIN_ENABLED;
    process.env.NODE_ENV = 'development';
    expect(isDemoLoginEnabled()).toBe(true);
    process.env.DEMO_LOGIN_ENABLED = 'false';
    expect(isDemoLoginEnabled()).toBe(false);
  });

  it('only allows allowlisted emails', () => {
    delete process.env.DEMO_ACCOUNT_EMAILS;
    expect(isDemoAccount('demo@student.com')).toBe(true);
    expect(isDemoAccount('DEMO@Admin.com ')).toBe(true);
    expect(isDemoAccount('real.user@gmail.com')).toBe(false);
    expect(isDemoAccount(undefined)).toBe(false);
    process.env.DEMO_ACCOUNT_EMAILS = 'a@x.com, b@x.com';
    expect(isDemoAccount('demo@student.com')).toBe(false);
    expect(isDemoAccount('b@x.com')).toBe(true);
  });
});
