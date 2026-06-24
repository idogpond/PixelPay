'use client';
import { useEffect } from 'react';
import { apiFetch, setAccessToken, readCookie } from '../lib/api-client';
import { useAuthStore } from '../stores/auth.store';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const token = readCookie('pixelpay-token');
    if (!token) return;

    setAccessToken(token);
    apiFetch<UserProfile>('/users/profile')
      .then((user) => setUser(user, token))
      .catch(() => setUser(null, null));
  }, [setUser]);

  return <>{children}</>;
}
