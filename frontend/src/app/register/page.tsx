'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authApi.register(form.name, form.email, form.password);
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      setUser(data.user);
      toast.success('Account created!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">JV SiteWatch</h1>
          <p className="text-slate-400 text-sm mt-1">DevOps Monitoring Platform</p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Create your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input name="name" type="text" className="input" placeholder="Jane Smith"
                value={form.name} onChange={onChange} required />
            </div>
            <div>
              <label className="label">Email address</label>
              <input name="email" type="email" className="input" placeholder="you@example.com"
                value={form.email} onChange={onChange} required autoComplete="email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input name="password" type="password" className="input" placeholder="Min. 8 characters"
                value={form.password} onChange={onChange} required minLength={8} />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input name="confirmPassword" type="password" className="input" placeholder="••••••••"
                value={form.confirmPassword} onChange={onChange} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{' '}
            <a href="/login" className="text-brand-600 hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </main>
  );
}
