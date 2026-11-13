import { afterEach, describe, expect, it, vi } from 'vitest';

// M177: a visitor who isn't signed in never downloads Firebase just to find that out.
const firebaseLoaded = vi.fn();
vi.mock('./firebase', () => {
  firebaseLoaded();
  return { auth: { authStateReady: async () => {}, currentUser: null } };
});

const store = (token: string | null) => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'accessToken' ? token : null), setItem: () => {} });
};

describe('getAuthToken', () => {
  afterEach(() => { vi.unstubAllGlobals(); firebaseLoaded.mockClear(); });

  it('answers at once for a visitor who is not signed in, without Firebase', async () => {
    store(null);
    const { getAuthToken } = await import('./auth-token');
    expect(await getAuthToken()).toBeNull();
    expect(firebaseLoaded).not.toHaveBeenCalled();
  });

  it('keeps demo tokens and asks Firebase for a signed-in person', async () => {
    store('mock-token-demo@student.com');
    const { getAuthToken } = await import('./auth-token');
    expect(await getAuthToken()).toBe('mock-token-demo@student.com');
    store('eyJ.a.b');
    expect(await getAuthToken()).toBeNull(); // the mocked Firebase has nobody signed in
    expect(firebaseLoaded).toHaveBeenCalled();
  });
});
