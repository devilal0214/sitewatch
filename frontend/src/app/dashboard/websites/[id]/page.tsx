'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { websitesApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import Link from 'next/link';

const fetchers = {
  website: (id: string) => websitesApi.get(id).then((r) => r.data),
  uptime: (id: string) => websitesApi.uptimeLogs(id, 48).then((r) => r.data),
  performance: (id: string) => websitesApi.performance(id, 24).then((r) => r.data),
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-white">{value}</span>
    </div>
  );
}

export default function WebsiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: website } = useSWR(`website-${id}`, () => fetchers.website(id), { refreshInterval: 30000 });
  const { data: uptimeLogs } = useSWR(`uptime-${id}`, () => fetchers.uptime(id), { refreshInterval: 60000 });
  const { data: perfLogs } = useSWR(`perf-${id}`, () => fetchers.performance(id), { refreshInterval: 60000 });

  const responseData = (uptimeLogs ?? []).slice(-48).map((l: any) => ({
    time: new Date(l.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    responseTime: l.responseTime,
    status: l.status === 'UP' ? 1 : 0,
  }));

  const perfData = (perfLogs ?? []).slice(-24).map((l: any) => ({
    time: new Date(l.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    pageLoad: l.pageLoadTime,
    fcp: l.fcp,
    lcp: l.lcp,
  }));

  if (!website) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/websites" className="text-sm text-slate-400 hover:text-brand-600">← Websites</Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{website.name}</h1>
        <StatusBadge status={website.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Site details */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-3">Details</h2>
          <InfoRow label="URL" value={<a href={website.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate max-w-[160px] block">{website.url}</a>} />
          <InfoRow label="Uptime (30d)" value={`${(website.uptimePercentage ?? 100).toFixed(2)}%`} />
          <InfoRow label="Check Interval" value={`${website.checkInterval} min`} />
          <InfoRow label="Last Response" value={website.lastResponseTime ? `${website.lastResponseTime}ms` : '—'} />
          <InfoRow label="Last Checked" value={website.lastCheckedAt ? new Date(website.lastCheckedAt).toLocaleString() : '—'} />
          {website.lastStatusCode && <InfoRow label="HTTP Status" value={website.lastStatusCode} />}
        </div>

        {/* SSL */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-3">SSL Certificate</h2>
          {website.sslRecord ? (
            <>
              <InfoRow label="Issuer" value={website.sslRecord.issuer ?? '—'} />
              <InfoRow label="Subject" value={website.sslRecord.subject ?? '—'} />
              <InfoRow label="Expires" value={website.sslRecord.validTo ? new Date(website.sslRecord.validTo).toLocaleDateString() : '—'} />
              <InfoRow label="Days Left" value={
                <span className={
                  website.sslRecord.daysUntilExpiry > 30 ? 'text-green-600 font-semibold' :
                  website.sslRecord.daysUntilExpiry > 7 ? 'text-yellow-600 font-semibold' : 'text-red-600 font-semibold'
                }>{website.sslRecord.daysUntilExpiry} days</span>
              } />
              <InfoRow label="Valid" value={website.sslRecord.isValid ? '✓ Valid' : '✗ Invalid'} />
            </>
          ) : (
            <p className="text-sm text-slate-400">No SSL data yet.</p>
          )}
        </div>

        {/* Domain */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-3">Domain</h2>
          {website.domainRecord ? (
            <>
              <InfoRow label="Domain" value={website.domainRecord.domain} />
              <InfoRow label="Registrar" value={website.domainRecord.registrar ?? '—'} />
              <InfoRow label="Expires" value={website.domainRecord.expiryDate ? new Date(website.domainRecord.expiryDate).toLocaleDateString() : '—'} />
              <InfoRow label="Days Left" value={
                <span className={
                  (website.domainRecord.daysUntilExpiry ?? 999) > 60 ? 'text-green-600 font-semibold' :
                  (website.domainRecord.daysUntilExpiry ?? 999) > 14 ? 'text-yellow-600 font-semibold' : 'text-red-600 font-semibold'
                }>{website.domainRecord.daysUntilExpiry ?? '—'} days</span>
              } />
            </>
          ) : (
            <p className="text-sm text-slate-400">No domain data yet.</p>
          )}
        </div>
      </div>

      {/* Response time chart */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Response Time (last 48 checks)</h2>
        {responseData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={responseData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} unit="ms" />
              <Tooltip formatter={(v: any) => [`${v}ms`, 'Response Time']} />
              <ReferenceLine y={2000} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '2s', fontSize: 10 }} />
              <Line type="monotone" dataKey="responseTime" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400">No response time data available yet.</p>
        )}
      </div>

      {/* Performance chart */}
      {perfData.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4">Performance Metrics (last 24 checks)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perfData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} unit="ms" />
              <Tooltip formatter={(v: any) => [`${v}ms`]} />
              <Line type="monotone" dataKey="pageLoad" stroke="#3b82f6" dot={false} name="Page Load" />
              <Line type="monotone" dataKey="fcp" stroke="#10b981" dot={false} name="FCP" />
              <Line type="monotone" dataKey="lcp" stroke="#f59e0b" dot={false} name="LCP" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
