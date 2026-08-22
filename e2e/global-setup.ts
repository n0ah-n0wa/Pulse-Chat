import { createConnection } from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(port)) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Timed out waiting for 127.0.0.1:${String(port)}`);
}

export default async function globalSetup(): Promise<void> {
  const mongoReady = await canConnect(27017);
  const redisReady = await canConnect(6379);

  if (!mongoReady || !redisReady) {
    const result = spawnSync('docker', ['compose', 'up', '-d', 'mongodb', 'redis'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error(
        `MongoDB (27017) and Redis (6379) must be reachable before E2E tests. docker compose up failed: ${result.stderr.trim()}`,
      );
    }
  }

  await waitForPort(27017, 60_000);
  await waitForPort(6379, 60_000);
}
