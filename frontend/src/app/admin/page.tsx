'use client';

import useSWR from 'swr';
import { adminApi } from '@/lib/api';
import AuthProvider from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fetcher = {
  health: () => adminApi.health().then((r) => r.data),
  users: () => adminApi.users().then((r) => r.data),
  metrics: () => adminApi.metrics().then((r) => r.data),
};

function QueueCard({ name, data }: { name: string; data: any }) {
  return (
    <div className="card p-4">
      <p className="font-semibold text-sm text-slate-700 dark:text-white mb-2">{name}</p>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div><span className="block text-lg font-bold text-green-600">{data?.completed ?? 0}</span>Completed</div>
        <div><span className="block text-lg font-bold text-yellow-600">{data?.active ?? 0}</span>Active</div>
        <div><span className="block text-lg font-bold text-red-600">{data?.failed ?? 0}</span>Failed</div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { data: health } = useSWR('admin-health', fetcher.health, { refreshInterval: 10000 });
  const { data: usersData } = useSWR('admin-users', fetcher.users, { refreshInterval: 30000 });
  const { data: metrics } = useSWR('admin-metrics', fetcher.metrics, { refreshInterval: 30000 });

  const queues = health?.queues ?? {};
  const queueNames = Object.keys(queues);

  const uptimeByDay = metrics?.uptimeByDay ?? [];

  return (
    <AuthProvider requireRole="ADMIN">
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Admin</h1>
            <p className="text-sm text-slate-500 mt-0.5">Platform health, queues, and user management</p>
          </div>

          {/* System health */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-sm text-slate-500">Database</p>
              <p className={`text-xl font-bold mt-1 ${health?.database === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {health?.database ?? '—'}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Redis</p>
              <p className={`text-xl font-bold mt-1 ${health?.redis === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {health?.redis ?? '—'}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Total Websites</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">
                {metrics?.totalWebsites ?? '—'}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">
                {metrics?.totalUsers ?? '—'}
              </p>
            </div>
          </div>

          {/* Queue stats */}
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-white mb-3">BullMQ Queue Stats</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {queueNames.map((q) => (
                <QueueCard key={q} name={q.replace(/_/g, ' ')} data={queues[q]} />
              ))}
            </div>
          </div>

          {/* Uptime trend */}
          {uptimeByDay.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Platform Uptime % (last 30d)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={uptimeByDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[90, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Avg Uptime']} />
                  <Bar dataKey="avgUptime" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Users table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-semibold text-slate-800 dark:text-white">Users</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Joined</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {(usersData ?? []).map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3"><span className="badge badge-blue">{u.role}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
