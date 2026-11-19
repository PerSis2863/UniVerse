import { describe, expect, it, vi } from 'vitest';
import { eraseAccount } from './account-deletion';

// M337: erasing an account reaches the apps added after it was written: connected accounts' keys, places watched for
// Relief alerts, Travel documents, and so on. Every model call is recorded by name.
const calls: string[] = [];
vi.mock('@/lib/db', () => {
  const model = (name: string) => new Proxy({}, { get: (_, op: string) => (...args: unknown[]) => { calls.push(`${name}.${op}`); return args; } });
  return { default: new Proxy({}, { get: (_, name: string) => (name === '$transaction' ? async (ops: unknown[]) => ops : model(name)) }) };
});
vi.mock('./auth', () => ({ forgetUser: vi.fn(), isOwnerEmail: vi.fn() }));
vi.mock('./email', () => ({ notify: vi.fn(), sendEmail: vi.fn() }));

describe('eraseAccount', () => {
  it('removes the newer apps’ personal rows and keys', async () => {
    await eraseAccount('u1');
    for (const c of ['oAuthConnection.deleteMany', 'reliefWatch.deleteMany', 'reliefPost.deleteMany', 'travelDoc.deleteMany', 'travelBoardPost.deleteMany', 'greenAction.deleteMany', 'traceScan.updateMany', 'gameScore.deleteMany', 'user.update']) expect(calls).toContain(c);
    // Under D1's 50 queries a request, with room for the request's own reads and writes around it.
    expect(calls.length).toBeLessThanOrEqual(45);
  });
});
