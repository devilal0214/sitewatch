'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { alertsApi, websitesApi, serversApi } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import toast from 'react-hot-toast';

const fetcher = () => alertsApi.list().then((r) => r.data);
const websitesFetcher = () => websitesApi.list().then((r) => r.data);
const serversFetcher = () => serversApi.list().then((r) => r.data);

const CHANNELS = ['EMAIL', 'SLACK', 'TELEGRAM', 'WEBHOOK', 'WHATSAPP'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const INCIDENT_TYPES = [
  'WEBSITE_DOWN', 'WEBSITE_SLOW', 'SSL_EXPIRING', 'SSL_EXPIRED',
  'DOMAIN_EXPIRING', 'DOMAIN_EXPIRED', 'SERVER_OVERLOAD', 'SERVER_OFFLINE',
  'CONTAINER_STOPPED', 'BACKUP_OVERDUE', 'WORDPRESS_VULNERABILITY',
];

function AddRuleModal({ websites, servers, onClose, onAdded }: any) {
  const [form, setForm] = useState({
    name: '',
    channel: 'EMAIL',
    emailTo: '',
    webhookUrl: '',
    slackWebhookUrl: '',
    telegramChatId: '',
    minSeverity: 'HIGH',
    incidentTypes: [] as string[],
    websiteId: '',
    serverId: '',
  });
  const [loading, setLoading] = useState(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }
  function toggleType(t: string) {
    setForm((p) => ({
      ...p,
      incidentTypes: p.incidentTypes.includes(t)
        ? p.incidentTypes.filter((x) => x !== t)
        : [...p.incidentTypes, t],
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await alertsApi.create({
        ...form,
        websiteId: form.websiteId || undefined,
        serverId: form.serverId || undefined,
        incidentTypes: form.incidentTypes.length ? form.incidentTypes : undefined,
      });
      toast.success('Alert rule created!');
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8">
      <div className="card w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Create Alert Rule</h2>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="label">Rule Name</label>
            <input name="name" className="input" placeholder="Critical alerts → Slack" value={form.name} onChange={onChange} required /></div>
          <div><label className="label">Channel</label>
            <select name="channel" className="input" value={form.channel} onChange={onChange}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>

          {form.channel === 'EMAIL' && (
            <div><label className="label">To Email</label>
              <input name="emailTo" type="email" className="input" placeholder="alerts@you.com" value={form.emailTo} onChange={onChange} /></div>
          )}
          {form.channel === 'SLACK' && (
            <div><label className="label">Slack Webhook URL</label>
              <input name="slackWebhookUrl" type="url" className="input" placeholder="https://hooks.slack.com/…" value={form.slackWebhookUrl} onChange={onChange} /></div>
          )}
          {form.channel === 'TELEGRAM' && (
            <div><label className="label">Telegram Chat ID</label>
              <input name="telegramChatId" className="input" placeholder="-100…" value={form.telegramChatId} onChange={onChange} /></div>
          )}
          {form.channel === 'WEBHOOK' && (
            <div><label className="label">Webhook URL</label>
              <input name="webhookUrl" type="url" className="input" placeholder="https://…" value={form.webhookUrl} onChange={onChange} /></div>
          )}

          <div><label className="label">Min. Severity</label>
            <select name="minSeverity" className="input" value={form.minSeverity} onChange={onChange}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>

          <div>
            <label className="label">Incident Types (none = all)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {INCIDENT_TYPES.map((t) => (
                <button key={t} type="button"
                  onClick={() => toggleType(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    form.incidentTypes.includes(t)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-slate-300 text-slate-500 hover:border-brand-400'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Website (optional)</label>
              <select name="websiteId" className="input" value={form.websiteId} onChange={onChange}>
                <option value="">All websites</option>
                {websites?.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className="label">Server (optional)</label>
              <select name="serverId" className="input" value={form.serverId} onChange={onChange}>
                <option value="">All servers</option>
                {servers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const { data: rules, mutate } = useSWR('alert-rules', fetcher, { refreshInterval: 60000 });
  const { data: websites } = useSWR('websites-for-alert', websitesFetcher);
  const { data: servers } = useSWR('servers-for-alert', serversFetcher);
  const [showAdd, setShowAdd] = useState(false);

  async function toggle(id: string) {
    try {
      await alertsApi.toggle(id);
      mutate();
    } catch { toast.error('Failed'); }
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this alert rule?')) return;
    try {
      await alertsApi.delete(id);
      toast.success('Rule deleted');
      mutate();
    } catch { toast.error('Failed'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Alert Rules</h1>
          <p className="text-sm text-slate-500 mt-0.5">{rules?.length ?? 0} rules configured</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Rule</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Channel</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Min Severity</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Target</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">Active</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {(rules ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                {rules === undefined ? 'Loading…' : 'No alert rules yet.'}
              </td></tr>
            )}
            {(rules ?? []).map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{r.name}</td>
                <td className="px-4 py-3"><span className="badge badge-blue">{r.channel}</span></td>
                <td className="px-4 py-3"><StatusBadge status={r.minSeverity} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {r.website?.name ?? r.server?.name ?? 'All assets'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(r.id)}
                    className={`w-10 h-5 rounded-full transition-colors ${r.isActive ? 'bg-brand-600' : 'bg-slate-300'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white shadow mx-0.5 transition-transform ${r.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteRule(r.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddRuleModal
          websites={websites}
          servers={servers}
          onClose={() => setShowAdd(false)}
          onAdded={() => mutate()}
        />
      )}
    </div>
  );
}
