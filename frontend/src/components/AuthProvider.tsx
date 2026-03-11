'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api';

interface Props {
  children: React.ReactNode;
  requireRole?: 'ADMIN' | 'AGENCY' | 'CLIENT';
}

export default function AuthProvider({ children, requireRole }: Props) {
  const { user, setUser, setLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        router.push('/login');
        return;
      }
      // Mirror token to cookie so middleware SSR redirects work
      document.cookie = `access_token=${token}; path=/; SameSite=Lax`;
      if (!user) {
        setLoading(true);
        try {
          const { data } = await authApi.me();
          setUser(data);
          if (requireRole && data.role !== 'ADMIN' && data.role !== requireRole) {
            router.push('/dashboard');
          }
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          router.push('/login');
        } finally {
          setLoading(false);
        }
      } else if (requireRole && user.role !== 'ADMIN' && user.role !== requireRole) {
        router.push('/dashboard');
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
