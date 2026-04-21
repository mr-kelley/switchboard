import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import { TransportServer } from '../../src/daemon/transport';
import { initConfig, getCertFingerprint } from '../../src/daemon/config';
import { serializeMessage, deserializeMessage, type DaemonMessage } from '../../src/shared/protocol';

describe('TransportServer', () => {
  let tmpDir: string;
  let server: TransportServer;
  let token: string;
  let port: number;
  let certPath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-transport-'));
    const config = initConfig(tmpDir, path.join(tmpDir, 'daemon.json'));
    token = config.auth.token;
    certPath = config.tls.cert;
    // Use a random high port
    port = 30000 + Math.floor(Math.random() * 10000);

    const messages: any[] = [];
    server = new TransportServer(
      {
        port,
        host: '127.0.0.1',
        tls: { cert: config.tls.cert, key: config.tls.key },
        token,
        daemonId: 'test-daemon',
        hostname: 'test-host',
        version: '0.0.1',
      },
      (conn, msg) => {
        messages.push(msg);
        // Echo back for testing
        if (msg.type === 'session:list') {
          server.send(conn.id, { type: 'session:list', sessions: [] });
        }
      }
    );

    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function connectWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        rejectUnauthorized: false, // Self-signed cert
      });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function sendAndReceive(ws: WebSocket, msg: object): Promise<DaemonMessage> {
    return new Promise((resolve) => {
      ws.once('message', (data) => {
        resolve(deserializeMessage(data.toString()) as DaemonMessage);
      });
      ws.send(JSON.stringify(msg));
    });
  }

  it('accepts a connection and authenticates with valid token', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, { type: 'auth', seq: 1, token });
    expect(response.type).toBe('auth:ok');
    expect((response as any).daemonId).toBe('test-daemon');
    expect((response as any).hostname).toBe('test-host');
    ws.close();
  });

  it('rejects authentication with invalid token', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, { type: 'auth', seq: 1, token: 'wrong-token' });
    expect(response.type).toBe('auth:fail');
    await new Promise((r) => setTimeout(r, 300)); // Wait for close
    ws.close();
  });

  it('rejects non-auth messages before authentication', async () => {
    const ws = await connectWs();
    const response = await sendAndReceive(ws, { type: 'session:list', seq: 1 });
    expect(response.type).toBe('auth:fail');
    ws.close();
  });

  it('responds to ping with pong after auth', async () => {
    const ws = await connectWs();
    await sendAndReceive(ws, { type: 'auth', seq: 1, token });
    const response = await sendAndReceive(ws, { type: 'ping', seq: 2 });
    expect(response.type).toBe('pong');
    ws.close();
  });

  it('broadcasts messages to multiple clients', async () => {
    const ws1 = await connectWs();
    const ws2 = await connectWs();

    await sendAndReceive(ws1, { type: 'auth', seq: 1, token });
    await sendAndReceive(ws2, { type: 'auth', seq: 1, token });

    // Broadcast
    const received: DaemonMessage[] = [];
    const p1 = new Promise<void>((resolve) => {
      ws1.once('message', (data) => {
        received.push(deserializeMessage(data.toString()) as DaemonMessage);
        resolve();
      });
    });
    const p2 = new Promise<void>((resolve) => {
      ws2.once('message', (data) => {
        received.push(deserializeMessage(data.toString()) as DaemonMessage);
        resolve();
      });
    });

    server.broadcast({ type: 'session:status', sessionId: 'test', status: 'idle' });
    await Promise.all([p1, p2]);

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('session:status');
    expect(received[1].type).toBe('session:status');

    ws1.close();
    ws2.close();
  });

  it('tracks connected count', async () => {
    // Wait for any previous test connections to fully close
    await new Promise((r) => setTimeout(r, 200));
    const initial = server.getConnectedCount();
    const ws = await connectWs();
    await sendAndReceive(ws, { type: 'auth', seq: 1, token });
    expect(server.getConnectedCount()).toBe(initial + 1);
    ws.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(server.getConnectedCount()).toBe(initial);
  });
});
