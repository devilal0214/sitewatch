'use client';

type Status =
  | 'UP' | 'DOWN' | 'DEGRADED' | 'PAUSED' | 'PENDING'
  | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  | 'ONLINE' | 'OFFLINE' | 'MAINTENANCE'
  | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  | 'ACTIVE' | 'INACTIVE' | string;

const map: Record<string, string> = {
  UP: 'badge-green',
  ONLINE: 'badge-green',
  ACTIVE: 'badge-green',
  DOWN: 'badge-red',
  OFFLINE: 'badge-red',
  CRITICAL: 'badge-red',
  DEGRADED: 'badge-yellow',
  HIGH: 'badge-orange',
  MEDIUM: 'badge-yellow',
  LOW: 'badge-blue',
  INFO: 'badge-blue',
  OPEN: 'badge-red',
  ACKNOWLEDGED: 'badge-yellow',
  RESOLVED: 'badge-green',
  PAUSED: 'badge-slate',
  PENDING: 'badge-slate',
  MAINTENANCE: 'badge-slate',
  INACTIVE: 'badge-slate',
};

export default function StatusBadge({ status }: { status: Status }) {
  const cls = map[status] ?? 'badge-slate';
  return <span className={`badge ${cls}`}>{status}</span>;
}
