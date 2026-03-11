import { NodeSSH } from 'node-ssh';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';
import { config } from '../config';

interface ServerMetrics {
  cpuUsage: number;
  ramUsage: number;
  ramTotal: bigint;
  ramUsed: bigint;
  diskUsage: number;
  diskTotal: bigint;
  diskUsed: bigint;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  uptimeSeconds: bigint;
}

export async function checkServer(serverId: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || !server.isActive) return;

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

    const metrics = await collectMetrics(ssh);

    await prisma.serverMetric.create({
      data: {
        serverId,
        ...metrics,
        recordedAt: new Date(),
      },
    });

    await prisma.server.update({
      where: { id: serverId },
      data: {
        isOnline: true,
        lastCheckedAt: new Date(),
        cpuUsage: metrics.cpuUsage,
        ramUsage: metrics.ramUsage,
        diskUsage: metrics.diskUsage,
        loadAverage: metrics.loadAvg1,
        uptimeSeconds: metrics.uptimeSeconds,
      },
    });

    // Check thresholds
    if (metrics.cpuUsage > config.thresholds.cpuWarning) {
      await incidentManager.createServerOverloadIncident(server, 'cpu', metrics.cpuUsage);
    }
    if (metrics.ramUsage > config.thresholds.ramWarning) {
      await incidentManager.createServerOverloadIncident(server, 'ram', metrics.ramUsage);
    }
    if (metrics.diskUsage > config.thresholds.diskWarning) {
      await incidentManager.createServerOverloadIncident(server, 'disk', metrics.diskUsage);
    }

  } catch (err: any) {
    logger.error('Server check failed', { serverId, host: server.host, error: err.message });
    await prisma.server.update({
      where: { id: serverId },
      data: { isOnline: false, lastCheckedAt: new Date() },
    });
    await incidentManager.createServerOfflineIncident(server, err.message);
  } finally {
    ssh.dispose();
  }
}

async function collectMetrics(ssh: NodeSSH): Promise<ServerMetrics> {
  const script = `
# CPU usage (single reading)
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | tr -d '[:space:]')
if [ -z "$CPU" ]; then
  CPU=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}')
fi

# RAM
RAM_INFO=$(free -b | grep Mem)
RAM_TOTAL=$(echo $RAM_INFO | awk '{print $2}')
RAM_USED=$(echo $RAM_INFO | awk '{print $3}')
RAM_PCT=$(echo "scale=2; $RAM_USED*100/$RAM_TOTAL" | bc)

# Disk
DISK_INFO=$(df -B1 / | tail -1)
DISK_TOTAL=$(echo $DISK_INFO | awk '{print $2}')
DISK_USED=$(echo $DISK_INFO | awk '{print $3}')
DISK_PCT=$(echo $DISK_INFO | awk '{print $5}' | tr -d '%')

# Load average
LOAD=$(cat /proc/loadavg | awk '{print $1, $2, $3}')
LOAD1=$(echo $LOAD | awk '{print $1}')
LOAD5=$(echo $LOAD | awk '{print $2}')
LOAD15=$(echo $LOAD | awk '{print $3}')

# Uptime in seconds
UPTIME=$(cat /proc/uptime | awk '{print $1}' | cut -d. -f1)

echo "$CPU $RAM_PCT $RAM_TOTAL $RAM_USED $DISK_PCT $DISK_TOTAL $DISK_USED $LOAD1 $LOAD5 $LOAD15 $UPTIME"
  `;

  const result = await ssh.execCommand(script.trim());
  if (result.stderr) {
    logger.warn('Server metrics script stderr', { stderr: result.stderr });
  }

  const parts = result.stdout.trim().split(/\s+/);
  if (parts.length < 11) {
    throw new Error(`Unexpected metrics output: ${result.stdout}`);
  }

  return {
    cpuUsage: parseFloat(parts[0]) || 0,
    ramUsage: parseFloat(parts[1]) || 0,
    ramTotal: BigInt(parts[2] || '0'),
    ramUsed: BigInt(parts[3] || '0'),
    diskUsage: parseFloat(parts[4]) || 0,
    diskTotal: BigInt(parts[5] || '0'),
    diskUsed: BigInt(parts[6] || '0'),
    loadAvg1: parseFloat(parts[7]) || 0,
    loadAvg5: parseFloat(parts[8]) || 0,
    loadAvg15: parseFloat(parts[9]) || 0,
    uptimeSeconds: BigInt(Math.floor(parseFloat(parts[10])) || 0),
  };
}
