'use client';

import useSWR from 'swr';
import { websitesApi, incidentsApi, serversApi } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import StatusBadge from '@/components/StatusBadge';
import Link from 'next/link';

const fetcher = {
  websites: () => websitesApi.list().then((r) => r.data),
  incidents: () => incidentsApi.list({ status: 'OPEN', limit: 5 }).then((r) => r.data),
  stats: () => incidentsApi.stats().then((r) => r.data),
  servers: () => serversApi.list().then((r) => r.data),
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color ?? 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: websites } = useSWR('websites', fetcher.websites, { refreshInterval: 30000 });
  const { data: incidentsData } = useSWR('incidents-open', fetcher.incidents, { refreshInterval: 30000 });
  const { data: stats } = useSWR('incidents-stats', fetcher.stats, { refreshInterval: 60000 });
  const { data: servers } = useSWR('servers', fetcher.servers, { refreshInterval: 60000 });

  const upCount = websites?.filter((w: any) => w.status === 'UP').length ?? 0;
  const downCount = websites?.filter((w: any) => w.status === 'DOWN').length ?? 0;
  const totalSites = websites?.length ?? 0;
  const avgUptime = websites?.length
    ? (websites.reduce((acc: number, w: any) => acc + (w.uptimePercentage ?? 100), 0) / websites.length).toFixed(2)
    : '—';

  // Build simple chart data from websites uptime
  const uptimeChartData = websites?.slice(0, 10).map((w: any) => ({
    name: (w.name as string).slice(0, 12),
    uptime: parseFloat((w.uptimePercentage ?? 100).toFixed(1)),
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Real-time status across all monitored assets</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Websites Monitored" value={totalSites} sub="Total tracked" />
        <StatCard label="Currently Up" value={upCount} color="text-green-600" sub="All passing checks" />
        <StatCard label="Currently Down" value={downCount} color={downCount > 0 ? 'text-red-600' : undefined} sub={downCount > 0 ? 'Needs attention' : 'All clear'} />
        <StatCard label="Avg. Uptime (30d)" value={`${avgUptime}%`} sub="Across all sites" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Uptime chart */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Website Uptime %</h2>
          {uptimeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={uptimeChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[90, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Uptime']} />
                <Bar dataKey="uptime" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
              No websites added yet.{' '}
              <Link href="/dashboard/websites" className="text-brand-600 ml-1 hover:underline">Add one →</Link>
            </div>
          )}
        </div>

        {/* Open incidents */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 dark:text-white">Open Incidents</h2>
            <Link href="/dashboard/incidents" className="text-sm text-brand-600 hover:underline">View all →</Link>
          </div>
          {incidentsData?.incidents?.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {incidentsData.incidents.map((inc: any) => (
                <div key={inc.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{inc.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {inc.website?.name ?? inc.server?.name ?? '—'} &middot;{' '}
                      {new Date(inc.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={inc.severity} />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
              No open incidents — all clear!
            </div>
          )}
        </div>
      </div>

      {/* Servers overview */}
      {servers?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800 dark:text-white">Server Health</h2>
            <Link href="/dashboard/servers" className="text-sm text-brand-600 hover:underline">Manage →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.slice(0, 6).map((srv: any) => (
              <div key={srv.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-slate-800 dark:text-white">{srv.name}</span>
                  <StatusBadge status={srv.status} />
                </div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>{srv.ipAddress} &middot; {srv.os}</div>
                  {srv.latestMetrics && (
                    <div>
                      CPU {srv.latestMetrics.cpuPercent?.toFixed(0)}% &middot;{' '}
                      RAM {srv.latestMetrics.ramPercent?.toFixed(0)}% &middot;{' '}
                      Disk {srv.latestMetrics.diskPercent?.toFixed(0)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
