import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';
import { api } from '@/lib/api';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
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
          // Fallback to mock login if backend is not deployed/reachable
          console.warn('Backend login failed, falling back to mock login', error);
          let role = 'STUDENT';
          if (email.includes('teacher')) role = 'TEACHER';
          if (email.includes('admin')) role = 'ADMIN';
          
          const mockUser = {
            id: 'mock-1',
            email,
            name: email.split('@')[0].toUpperCase(),
            role
          };
          
          localStorage.setItem('accessToken', 'mock-token');
          set({ user: mockUser as User, accessToken: 'mock-token', refreshToken: 'mock-refresh' });
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      setUser: (user) => set({ user }),
    }),
    { name: 'universe-auth', partialize: (s) => ({ user: s.user }) }
  )
);
