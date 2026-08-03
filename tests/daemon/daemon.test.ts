import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import { Daemon } from '../../src/daemon/daemon';
import { deserializeMessage, type DaemonMessage } from '../../src/shared/protocol';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'tls');
function pem(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

describe('Daemon (integration, mTLS)', () => {
  let tmpDir: string;
  let daemon: Daemon;
  let port: number;
  const savedHome = process.env.SWITCHBOARD_HOME;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-daemon-'));
    port = 31000 + Math.floor(Math.random() * 10000);
    process.env.SWITCHBOARD_HOME = tmpDir;

    // Seed the tls dir at the well-known path (tmpDir/tls).
    const tlsDir = path.join(tmpDir, 'tls');
    fs.mkdirSync(tlsDir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, 'server.crt'), path.join(tlsDir, 'server.crt'));
    fs.copyFileSync(path.join(FIXTURES, 'server.key'), path.join(tlsDir, 'server.key'));
    fs.copyFileSync(path.join(FIXTURES, 'ca.crt'), path.join(tlsDir, 'ca.crt'));

    // Write config with our test port.
    const cfgPath = path.join(tmpDir, 'daemon.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ port, host: '127.0.0.1' }));

    daemon = new Daemon(cfgPath);
    await daemon.start();
  }, 15000);

  afterAll(async () => {
    await daemon.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.SWITCHBOARD_HOME;
    else process.env.SWITCHBOARD_HOME = savedHome;
  });

  function connectAndReady(): Promise<{ ws: WebSocket; messages: DaemonMessage[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
        cert: pem('client.crt'),
        key: pem('client.key'),
        ca: pem('ca.crt'),
      });
      const messages: DaemonMessage[] = [];
      ws.on('message', (data) => {
        const msg = deserializeMessage(data.toString()) as DaemonMessage;
        messages.push(msg);
        // The daemon sends auth:ok then session:list on connect.
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
      const handler = (data: Buffer): void => {
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

  it('accepts an authorized client and returns empty session list', async () => {
    const { ws, messages } = await connectAndReady();
    expect(messages[0].type).toBe('auth:ok');
    expect(messages[1].type).toBe('session:list');
    expect((messages[1] as { sessions: unknown[] }).sessions).toEqual([]);
    ws.close();
  });

  it('spawns a session and streams output', async () => {
    const { ws } = await connectAndReady();

    const createdPromise = waitForMessage(ws, 'session:created');
    ws.send(JSON.stringify({
      type: 'session:spawn',
      seq: 2,
      name: 'test-session',
      cwd: os.tmpdir(),
    }));

    const created = await createdPromise;
    const sessionId = (created as { session: { id: string; name: string } }).session.id;
    expect(sessionId).toBeDefined();

    await waitForMessage(ws, 'session:data');

    const closedPromise = waitForMessage(ws, 'session:closed');
    ws.send(JSON.stringify({ type: 'session:close', seq: 3, sessionId }));
    await closedPromise;
    ws.close();
  }, 10000);

  it('returns UNKNOWN_SESSION on replay-request for a bogus id', async () => {
    const { ws } = await connectAndReady();
    const errorPromise = waitForMessage(ws, 'error');
    ws.send(JSON.stringify({ type: 'session:replay-request', seq: 2, sessionId: 'nonexistent-id' }));
    const err = await errorPromise;
    expect((err as { code: string }).code).toBe('UNKNOWN_SESSION');
    ws.close();
  }, 10000);
});
