'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { websitesApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';
import Link from 'next/link';

const fetcher = () => websitesApi.list().then((r) => r.data);

const INTERVALS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
];

function AddWebsiteModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', url: '', checkInterval: 5 });
  const [loading, setLoading] = useState(false);
  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.name === 'checkInterval' ? Number(e.target.value) : e.target.value }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await websitesApi.create(form);
      toast.success('Website added!');
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to add website');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Add Website</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Site Name</label>
            <input name="name" className="input" placeholder="My Client Site" value={form.name} onChange={onChange} required />
          </div>
          <div>
            <label className="label">URL</label>
            <input name="url" type="url" className="input" placeholder="https://example.com" value={form.url} onChange={onChange} required />
          </div>
          <div>
            <label className="label">Check Interval</label>
            <select name="checkInterval" className="input" value={form.checkInterval} onChange={onChange}>
              {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Adding...' : 'Add Website'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WebsitesPage() {
  const { data: websites, mutate } = useSWR('websites', fetcher, { refreshInterval: 30000 });
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = (websites ?? []).filter((w: any) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.url.toLowerCase().includes(search.toLowerCase())
  );

  async function triggerCheck(id: string) {
    try {
      await websitesApi.triggerCheck(id);
      toast.success('Check triggered!');
      setTimeout(() => mutate(), 3000);
    } catch {
      toast.error('Failed to trigger check');
    }
  }

  async function deleteWebsite(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await websitesApi.delete(id);
      toast.success('Website removed');
      mutate();
    } catch {
      toast.error('Failed to delete website');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Websites</h1>
          <p className="text-sm text-slate-500 mt-0.5">{websites?.length ?? 0} sites monitored</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Website</button>
      </div>

      <div>
        <input className="input max-w-xs" placeholder="Search by name or URL…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Site</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Uptime (30d)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Response</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">SSL</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {websites === undefined ? 'Loading…' : 'No websites found.'}
                </td>
              </tr>
            )}
            {filtered.map((w: any) => (
              <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/websites/${w.id}`} className="font-medium text-slate-800 dark:text-white hover:text-brand-600">
                    {w.name}
                  </Link>
                  <div className="text-xs text-slate-400 truncate max-w-[200px]">{w.url}</div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${(w.uptimePercentage ?? 100) >= 99 ? 'text-green-600' : (w.uptimePercentage ?? 100) >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {(w.uptimePercentage ?? 100).toFixed(2)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {w.lastResponseTime ? `${w.lastResponseTime}ms` : '—'}
                </td>
                <td className="px-4 py-3">
                  {w.sslRecord ? (
                    <span className={`text-xs font-medium ${w.sslRecord.daysUntilExpiry > 30 ? 'text-green-600' : w.sslRecord.daysUntilExpiry > 7 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {w.sslRecord.daysUntilExpiry}d
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  <button onClick={() => triggerCheck(w.id)} className="text-xs text-brand-600 hover:underline">Check now</button>
                  <button onClick={() => deleteWebsite(w.id, w.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddWebsiteModal onClose={() => setShowAdd(false)} onAdded={() => mutate()} />}
    </div>
  );
}
