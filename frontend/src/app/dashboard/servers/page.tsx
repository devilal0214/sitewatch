'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { serversApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';

const fetcher = () => serversApi.list().then((r) => r.data);

function MiniGauge({ label, value }: { label: string; value: number }) {
  const color = value > 90 ? 'bg-red-500' : value > 75 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{label}</span><span>{value?.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function AddServerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', ipAddress: '', port: 22, os: 'ubuntu', sshUser: 'root', sshPassword: '' });
  const [loading, setLoading] = useState(false);
  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.name === 'port' ? Number(e.target.value) : e.target.value }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await serversApi.create(form);
      toast.success('Server added!');
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to add server');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Add Server</h2>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="label">Server Name</label>
            <input name="name" className="input" placeholder="prod-web-01" value={form.name} onChange={onChange} required /></div>
          <div><label className="label">IP Address</label>
            <input name="ipAddress" className="input" placeholder="192.168.1.1" value={form.ipAddress} onChange={onChange} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">SSH Port</label>
              <input name="port" type="number" className="input" value={form.port} onChange={onChange} /></div>
            <div><label className="label">OS</label>
              <select name="os" className="input" value={form.os} onChange={onChange}>
                <option value="ubuntu">Ubuntu</option>
                <option value="debian">Debian</option>
                <option value="centos">CentOS</option>
                <option value="rocky">Rocky Linux</option>
                <option value="fedora">Fedora</option>
                <option value="other">Other</option>
              </select></div>
          </div>
          <div><label className="label">SSH User</label>
            <input name="sshUser" className="input" value={form.sshUser} onChange={onChange} required /></div>
          <div><label className="label">SSH Password</label>
            <input name="sshPassword" type="password" className="input" placeholder="password or leave blank for key auth" value={form.sshPassword} onChange={onChange} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ServersPage() {
  const { data: servers, mutate } = useSWR('servers', fetcher, { refreshInterval: 30000 });
  const [showAdd, setShowAdd] = useState(false);

  async function deleteServer(id: string, name: string) {
    if (!confirm(`Remove server "${name}"?`)) return;
    try {
      await serversApi.delete(id);
      toast.success('Server removed');
      mutate();
    } catch {
      toast.error('Failed to remove server');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Servers</h1>
          <p className="text-sm text-slate-500 mt-0.5">{servers?.length ?? 0} servers monitored</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Server</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {servers === undefined && (
          <p className="text-slate-400 text-sm col-span-full">Loading…</p>
        )}
        {servers?.length === 0 && (
          <p className="text-slate-400 text-sm col-span-full">No servers added yet.</p>
        )}
        {servers?.map((srv: any) => (
          <div key={srv.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">{srv.name}</p>
                <p className="text-xs text-slate-400">{srv.ipAddress} &middot; {srv.os}</p>
              </div>
              <StatusBadge status={srv.status} />
            </div>

            {srv.latestMetrics ? (
              <div className="space-y-2">
                <MiniGauge label="CPU" value={srv.latestMetrics.cpuPercent ?? 0} />
                <MiniGauge label="RAM" value={srv.latestMetrics.ramPercent ?? 0} />
                <MiniGauge label="Disk" value={srv.latestMetrics.diskPercent ?? 0} />
                <p className="text-xs text-slate-400">
                  Load: {srv.latestMetrics.load1?.toFixed(2)} &middot; Uptime: {Math.floor((srv.latestMetrics.uptime ?? 0)/3600)}h
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No metrics yet — SSH check pending.</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => deleteServer(srv.id, srv.name)}
                className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddServerModal onClose={() => setShowAdd(false)} onAdded={() => mutate()} />}
    </div>
  );
}
