import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import { Daemon } from '../../src/daemon/daemon';
import { deserializeMessage, type DaemonMessage } from '../../src/shared/protocol';

describe('Daemon (integration)', () => {
  let tmpDir: string;
  let daemon: Daemon;
  let token: string;
  let port: number;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-daemon-'));
    port = 31000 + Math.floor(Math.random() * 10000);

    // Write config manually so we control the port
    const cfgPath = path.join(tmpDir, 'daemon.json');

    // Use initConfig to generate certs, then override port
    const { initConfig } = await import('../../src/daemon/config');
    const config = initConfig(tmpDir, cfgPath);
    token = config.auth.token;

    // Rewrite config with our test port
    config.port = port;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    daemon = new Daemon(cfgPath);
    await daemon.start();
  }, 15000);

  afterAll(async () => {
    await daemon.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function connectAndAuth(): Promise<{ ws: WebSocket; messages: DaemonMessage[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        rejectUnauthorized: false,
      });
      const messages: DaemonMessage[] = [];

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth', seq: 1, token }));
      });

      ws.on('message', (data) => {
        const msg = deserializeMessage(data.toString()) as DaemonMessage;
        messages.push(msg);
        // auth:ok followed by session:list means we're ready
        if (msg.type === 'session:list') {
          resolve({ ws, messages });
        }
      });

      ws.on('error', reject);
    });
  }

  function waitForMessage(ws: WebSocket, type: string, timeout = 5000): Promise<DaemonMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
      const handler = (data: any) => {
        const msg = deserializeMessage(data.toString()) as DaemonMessage;
        if (msg.type === type) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
    });
  }

  it('accepts connection and returns empty session list', async () => {
    const { ws, messages } = await connectAndAuth();
    expect(messages[0].type).toBe('auth:ok');
    expect(messages[1].type).toBe('session:list');
    expect((messages[1] as any).sessions).toEqual([]);
    ws.close();
  });

  it('spawns a session and streams output', async () => {
    const { ws } = await connectAndAuth();

    // Spawn a session
    const createdPromise = waitForMessage(ws, 'session:created');
    ws.send(JSON.stringify({
      type: 'session:spawn',
      seq: 2,
      name: 'test-session',
      cwd: os.tmpdir(),
    }));

    const created = await createdPromise;
    expect(created.type).toBe('session:created');
    const sessionId = (created as any).session.id;
    expect(sessionId).toBeDefined();
    expect((created as any).session.name).toBe('test-session');

    // Wait for some output (shell prompt)
    const data = await waitForMessage(ws, 'session:data');
    expect(data.type).toBe('session:data');
    expect((data as any).sessionId).toBe(sessionId);

    // Close the session
    const closedPromise = waitForMessage(ws, 'session:closed');
    ws.send(JSON.stringify({
      type: 'session:close',
      seq: 3,
      sessionId,
    }));
    const closed = await closedPromise;
    expect(closed.type).toBe('session:closed');

    ws.close();
  }, 10000);

  it('sends input to a session', async () => {
    const { ws } = await connectAndAuth();

    // Spawn
    const createdPromise = waitForMessage(ws, 'session:created');
    ws.send(JSON.stringify({
      type: 'session:spawn',
      seq: 2,
      name: 'input-test',
      cwd: os.tmpdir(),
    }));
    const created = await createdPromise;
    const sessionId = (created as any).session.id;

    // Wait for initial prompt
    await waitForMessage(ws, 'session:data');

    // Send input
    ws.send(JSON.stringify({
      type: 'session:input',
      seq: 3,
      sessionId,
      data: 'echo hello-switchboard\n',
    }));

    // Wait for echo output
    const output = await waitForMessage(ws, 'session:data');
    expect((output as any).data).toBeDefined();

    // Cleanup
    ws.send(JSON.stringify({ type: 'session:close', seq: 4, sessionId }));
    await waitForMessage(ws, 'session:closed');
    ws.close();
  }, 10000);

  it('renames a session', async () => {
    const { ws } = await connectAndAuth();

    // Spawn
    const createdPromise = waitForMessage(ws, 'session:created');
    ws.send(JSON.stringify({
      type: 'session:spawn',
      seq: 2,
      name: 'before-rename',
      cwd: os.tmpdir(),
    }));
    const created = await createdPromise;
    const sessionId = (created as any).session.id;

    // Rename
    const renamedPromise = waitForMessage(ws, 'session:renamed');
    ws.send(JSON.stringify({
      type: 'session:rename',
      seq: 3,
      sessionId,
      name: 'after-rename',
    }));
    const renamed = await renamedPromise;
    expect((renamed as any).name).toBe('after-rename');

    // Cleanup
    ws.send(JSON.stringify({ type: 'session:close', seq: 4, sessionId }));
    await waitForMessage(ws, 'session:closed');
    ws.close();
  }, 10000);
});
