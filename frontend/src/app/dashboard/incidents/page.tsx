'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { incidentsApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';

const STATUSES = ['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
const SEVERITIES = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const fetcher = (params: any) => incidentsApi.list(params).then((r) => r.data);

export default function IncidentsPage() {
  const [status, setStatus] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;

  const params = {
    status: status === 'ALL' ? undefined : status,
    severity: severity === 'ALL' ? undefined : severity,
    page,
    limit,
  };

  const { data, mutate } = useSWR(
    ['incidents', status, severity, page],
    () => fetcher(params),
    { refreshInterval: 30000 }
  );

  async function acknowledge(id: string) {
    try {
      await incidentsApi.acknowledge(id);
      toast.success('Incident acknowledged');
      mutate();
    } catch { toast.error('Failed'); }
  }

  async function resolve(id: string) {
    try {
      await incidentsApi.resolve(id, 'Manually resolved via dashboard');
      toast.success('Incident resolved');
      mutate();
    } catch { toast.error('Failed'); }
  }

  const incidents = data?.incidents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Incidents</h1>
        <p className="text-sm text-slate-500 mt-0.5">{total} incidents found</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Severity</label>
          <select className="input" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Asset</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Severity</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Started</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {incidents.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                {data === undefined ? 'Loading…' : 'No incidents found.'}
              </td></tr>
            )}
            {incidents.map((inc: any) => (
              <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800 dark:text-white">{inc.title}</p>
                  {inc.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{inc.description}</p>}
                  {inc.aiAnalysis && (
                    <p className="text-xs text-indigo-500 mt-0.5 truncate max-w-xs">AI: {inc.aiAnalysis}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {inc.website?.name ?? inc.server?.name ?? '—'}
                </td>
                <td className="px-4 py-3"><StatusBadge status={inc.severity} /></td>
                <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {new Date(inc.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  {inc.status === 'OPEN' && (
                    <button onClick={() => acknowledge(inc.id)} className="text-xs text-yellow-600 hover:underline">
                      Acknowledge
                    </button>
                  )}
                  {inc.status !== 'RESOLVED' && (
                    <button onClick={() => resolve(inc.id)} className="text-xs text-green-600 hover:underline">
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs px-3 py-1 disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs px-3 py-1 disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
