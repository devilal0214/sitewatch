'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { statusApi } from '@/lib/api';

const fetcher = (slug: string) => statusApi.page(slug).then((r) => r.data);

const STATUS_COLOR: Record<string, string> = {
  UP: 'bg-green-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-yellow-500',
  PAUSED: 'bg-slate-400',
  PENDING: 'bg-slate-400',
};

const STATUS_LABEL: Record<string, string> = {
  UP: 'Operational',
  DOWN: 'Major Outage',
  DEGRADED: 'Degraded Performance',
  PAUSED: 'Paused',
  PENDING: 'Checking…',
};

export default function StatusPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, error } = useSWR(`status-${slug}`, () => fetcher(slug), {
    refreshInterval: 60000,
  });

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-700">Status page not found</h1>
          <p className="text-slate-400 mt-2">The status page you requested does not exist.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400">Loading status page…</div>
      </main>
    );
  }

  const statusPage = data.statusPage;
  const items = data.items ?? [];
  const allUp = items.every((i: any) => i.website?.status === 'UP' || i.website?.status === 'PAUSED');
  const anyDown = items.some((i: any) => i.website?.status === 'DOWN');
  const anyDegraded = items.some((i: any) => i.website?.status === 'DEGRADED');

  const overallStatus = anyDown ? 'Major Outage' : anyDegraded ? 'Degraded Performance' : 'All Systems Operational';
  const overallColor = anyDown ? 'bg-red-500' : anyDegraded ? 'bg-yellow-500' : 'bg-green-500';
  const overallTextColor = anyDown ? 'text-red-700' : anyDegraded ? 'text-yellow-700' : 'text-green-700';
  const overallBg = anyDown ? 'bg-red-50' : anyDegraded ? 'bg-yellow-50' : 'bg-green-50';

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 py-8">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-slate-900">{statusPage.title}</h1>
          {statusPage.description && (
            <p className="text-slate-500 mt-2">{statusPage.description}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Overall status banner */}
        <div className={`rounded-xl px-6 py-5 ${overallBg} flex items-center gap-4`}>
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${overallColor}`} />
          <span className={`font-semibold text-lg ${overallTextColor}`}>{overallStatus}</span>
        </div>

        {/* Services */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 font-semibold text-sm text-slate-700">
            Services
          </div>
          <div className="divide-y divide-slate-100">
            {items.length === 0 && (
              <div className="px-5 py-4 text-slate-400 text-sm">No services configured.</div>
            )}
            {items.map((item: any) => {
              const ws = item.website;
              const st = ws?.status ?? 'PENDING';
              return (
                <div key={item.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{item.displayName ?? ws?.name}</p>
                    {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLOR[st] ?? 'bg-slate-400'}`} />
                    <span className="text-sm text-slate-600">{STATUS_LABEL[st] ?? st}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">
          Last updated: {new Date().toLocaleString()} &middot; Powered by JV SiteWatch
        </p>
      </div>
    </main>
  );
}
