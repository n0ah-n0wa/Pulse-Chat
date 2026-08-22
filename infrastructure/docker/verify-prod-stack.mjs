/**
 * Production-path check: REST, WebSocket upgrade, and realtime fan-out all
 * go through nginx. Two Socket.IO clients connect via the reverse proxy;
 * least_conn should place them on different API processes. Each sends
 * `message:send` over the proxy; the other must receive `message:new`,
 * which for a remote instance is Redis Pub/Sub.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const require = createRequire(
  fileURLToPath(new URL('../../apps/web/package.json', import.meta.url)),
);
const { io } = require('socket.io-client');

const execFileAsync = promisify(execFile);
const origin = process.env.PULSE_PUBLIC_ORIGIN ?? 'http://localhost:8080';
const originUrl = new URL(origin);
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function unique(label) {
  return `${label}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function jsonRequest(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${String(response.status)} ${text}`);
  }

  return text.length === 0 ? undefined : JSON.parse(text);
}

async function register(label) {
  const username = unique(label);
  return jsonRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      email: `${username}@example.com`,
      password: 'secure-password',
      displayName: `Prod ${label}`,
    },
  });
}

function probeWebSocketUpgrade() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: originUrl.hostname,
        port: originUrl.port.length > 0 ? Number(originUrl.port) : 80,
        path: '/socket.io/?EIO=4&transport=websocket',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
          Origin: origin,
          Host: originUrl.host,
        },
      },
      (res) => {
        reject(new Error(`WebSocket upgrade expected 101, received ${String(res.statusCode)}`));
      },
    );
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({
        status: res.statusCode,
        connection: res.headers['connection'],
        upgrade: res.headers['upgrade'],
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(origin, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      extraHeaders: { Origin: origin },
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('socket connect timeout'));
    }, 10_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForRoomJoined(socket, roomId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`room:joined timeout for ${roomId}`));
    }, 10_000);
    socket.once('error', (payload) => {
      clearTimeout(timer);
      reject(new Error(`socket error: ${JSON.stringify(payload)}`));
    });
    socket.once('room:joined', (event) => {
      if (event.roomId === roomId) {
        clearTimeout(timer);
        resolve(event);
      }
    });
    socket.emit('room:join', { roomId });
  });
}

function waitForMessage(socket, content) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`message:new timeout waiting for ${content}`));
    }, 10_000);
    const onNew = (event) => {
      if (event.message.content === content) {
        clearTimeout(timer);
        socket.off('message:new', onNew);
        resolve(event.message);
      }
    };
    socket.on('message:new', onNew);
  });
}

async function readPresenceInstance(userId) {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.prod.yml',
      'exec',
      '-T',
      'redis',
      'redis-cli',
      'GET',
      `presence:user:${userId}`,
    ],
    { cwd: repoRoot },
  );
  const raw = stdout.trim();
  if (raw.length === 0 || raw === '(nil)') {
    throw new Error(`no presence key for ${userId}`);
  }

  const parsed = JSON.parse(raw);
  if (typeof parsed.instanceId !== 'string' || parsed.instanceId.length === 0) {
    throw new Error(`presence payload missing instanceId: ${raw}`);
  }

  return parsed.instanceId;
}

async function connectOnDifferentInstances(tokenA, userIdA, tokenB, userIdB) {
  const socketA = await connectSocket(tokenA);
  await delay(200);
  let socketB = await connectSocket(tokenB);

  let instanceA = await readPresenceInstance(userIdA);
  let instanceB = await readPresenceInstance(userIdB);

  if (instanceA === instanceB) {
    socketB.disconnect();
    await delay(300);
    socketB = await connectSocket(tokenB);
    instanceA = await readPresenceInstance(userIdA);
    instanceB = await readPresenceInstance(userIdB);
  }

  if (instanceA === instanceB) {
    socketA.disconnect();
    socketB.disconnect();
    throw new Error(
      `both sockets landed on ${instanceA}; nginx is not spreading WebSocket connections`,
    );
  }

  return { socketA, socketB, instanceA, instanceB };
}

const upgrade = await probeWebSocketUpgrade();
if (upgrade.status !== 101 || upgrade.upgrade !== 'websocket') {
  throw new Error(`nginx WebSocket upgrade failed: ${JSON.stringify(upgrade)}`);
}

const userA = await register('proda');
const userB = await register('prodb');
const room = await jsonRequest('/api/rooms', {
  method: 'POST',
  token: userA.accessToken,
  body: { type: 'PUBLIC', name: `prod-ws-${unique('room')}` },
});
await jsonRequest(`/api/rooms/${room.id}/join`, {
  method: 'POST',
  token: userB.accessToken,
});

const { socketA, socketB, instanceA, instanceB } = await connectOnDifferentInstances(
  userA.accessToken,
  userA.user.id,
  userB.accessToken,
  userB.user.id,
);

try {
  await waitForRoomJoined(socketA, room.id);
  await waitForRoomJoined(socketB, room.id);

  const fromA = `from-nginx-a-${unique('m')}`;
  const fromB = `from-nginx-b-${unique('m')}`;
  const waitB = waitForMessage(socketB, fromA);
  const waitA = waitForMessage(socketA, fromB);

  socketA.emit('message:send', {
    roomId: room.id,
    content: fromA,
    clientMessageId: unique('c'),
  });
  await waitB;

  socketB.emit('message:send', {
    roomId: room.id,
    content: fromB,
    clientMessageId: unique('c'),
  });
  await waitA;
} finally {
  socketA.disconnect();
  socketB.disconnect();
}

process.stdout.write(
  `ok: nginx upgrade ${String(upgrade.status)}; sockets on ${instanceA} and ${instanceB}; message:send through proxy both ways\n`,
);
