import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { User } from '@/types';
import { api } from '@/lib/api';
import { endViewAs, viewAsToken } from '@/lib/view-as';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken?: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
        } catch (error) {
          console.error('Login failed:', error);
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (name, email, password, role) => {
        set({ isLoading: true });
        try {
          await api.post('/auth/register', { name, email, password, role });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        // Viewing as someone (owner support): end that in this tab; the owner stays signed in.
        if (viewAsToken()) { void endViewAs(); return; }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('uv-pass');
        localStorage.removeItem('refreshToken');
        // Offline outbox, saved chats and drafts belong to this person, not the next one on the device.
        void import('@/lib/outbox').then((o) => o.clearOffline()).catch(() => {});
        set({ user: null, accessToken: null, refreshToken: null });
      },

      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken: refreshToken ?? null });
      },
    }),
    {
      name: 'universe-auth',
      partialize: (s) => ({ user: s.user }),
      // A "view as" tab keeps that person's account to itself (src/lib/view-as.ts).
      storage: createJSONStorage(() => (viewAsToken() ? sessionStorage : localStorage)),
    }
  )
);
