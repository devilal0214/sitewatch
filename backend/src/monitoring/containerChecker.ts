import { NodeSSH } from 'node-ssh';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';

interface ContainerInfo {
  containerId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpuPercent: number;
  memPercent: number;
}

export async function checkContainers(serverId: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || !server.isActive || !server.isOnline) return;

  const ssh = new NodeSSH();

  try {
    await ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.sshPassword || undefined,
      privateKeyPath: server.sshKeyPath || undefined,
      readyTimeout: 15000,
    });

    const containers = await fetchContainers(ssh);

    for (const c of containers) {
      const normalized = normalizeState(c.state);

      await prisma.container.upsert({
        where: { id: await getContainerDbId(serverId, c.containerId) },
        create: {
          serverId,
          containerId: c.containerId,
          name: c.name,
          image: c.image,
          state: normalized as any,
          status: c.status,
          cpuPercent: c.cpuPercent,
          memPercent: c.memPercent,
          isActive: true,
          lastCheckedAt: new Date(),
        },
        update: {
          state: normalized as any,
          status: c.status,
          cpuPercent: c.cpuPercent,
          memPercent: c.memPercent,
          lastCheckedAt: new Date(),
        },
      });

      // Alert on stopped / restarting containers
      if (normalized === 'stopped' || normalized === 'exited' || normalized === 'dead') {
        const dbContainer = await prisma.container.findFirst({ where: { serverId, containerId: c.containerId } });
        if (dbContainer) {
          await incidentManager.createContainerStoppedIncident(server, dbContainer);
        }
      }

      if (normalized === 'restarting') {
        const dbContainer = await prisma.container.findFirst({ where: { serverId, containerId: c.containerId } });
        if (dbContainer) {
          await incidentManager.createContainerRestartingIncident(server, dbContainer);
        }
      }
    }
  } catch (err: any) {
    logger.error('Container check failed', { serverId, error: err.message });
  } finally {
    ssh.dispose();
  }
}

async function fetchContainers(ssh: NodeSSH): Promise<ContainerInfo[]> {
  const result = await ssh.execCommand(
    `docker stats --no-stream --format "{{.ID}}|{{.Name}}|{{.Container}}|{{.CPUPerc}}|{{.MemPerc}}" 2>/dev/null; docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}" 2>/dev/null`,
  );

  if (!result.stdout.trim()) return [];

  const statsMap: Record<string, { cpu: number; mem: number }> = {};
  const containers: ContainerInfo[] = [];

  const lines = result.stdout.trim().split('\n');

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length === 5) {
      const id = parts[0].trim();
      const cpuStr = parts[3]?.replace('%', '').trim() || '0';
      const memStr = parts[4]?.replace('%', '').trim() || '0';
      statsMap[id] = { cpu: parseFloat(cpuStr) || 0, mem: parseFloat(memStr) || 0 };
    }
  }

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length === 5 && !line.includes('%')) {
      const id = parts[0].trim();
      const name = parts[1].trim();
      const image = parts[2].trim();
      const state = parts[3].trim();
      const status = parts[4].trim();

      const stats = statsMap[id] || statsMap[id.substring(0, 12)] || { cpu: 0, mem: 0 };

      containers.push({
        containerId: id,
        name,
        image,
        state,
        status,
        cpuPercent: stats.cpu,
        memPercent: stats.mem,
      });
    }
  }

  return containers;
}

async function getContainerDbId(serverId: string, containerId: string): Promise<string> {
  const existing = await prisma.container.findFirst({ where: { serverId, containerId } });
  return existing?.id || `new-${containerId}`;
}

function normalizeState(state: string): string {
  const s = state.toLowerCase();
  if (s === 'running') return 'running';
  if (s === 'exited') return 'exited';
  if (s === 'stopped') return 'stopped';
  if (s === 'restarting') return 'restarting';
  if (s === 'paused') return 'paused';
  if (s === 'dead') return 'dead';
  return 'stopped';
}
