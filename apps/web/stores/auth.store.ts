import { create } from 'zustand';
import { setAccessToken } from '../lib/api-client';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null, token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user, token) => {
    setAccessToken(token);
    set({ user, isLoading: false });
  },
  logout: () => {
    setAccessToken(null);
    set({ user: null });
  },
}));
