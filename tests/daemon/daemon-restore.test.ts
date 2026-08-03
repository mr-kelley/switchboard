import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import { Daemon } from '../../src/daemon/daemon';
import { deserializeMessage, type DaemonMessage } from '../../src/shared/protocol';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'tls');

let tmpDir: string;
let daemon: Daemon | null = null;
const savedHome = process.env.SWITCHBOARD_HOME;

afterEach(async () => {
  if (daemon) {
    await daemon.stop();
    daemon = null;
  }
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  if (savedHome === undefined) delete process.env.SWITCHBOARD_HOME;
  else process.env.SWITCHBOARD_HOME = savedHome;
});

function seedTls(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'server.crt'), path.join(dir, 'server.crt'));
  fs.copyFileSync(path.join(FIXTURES, 'server.key'), path.join(dir, 'server.key'));
  fs.copyFileSync(path.join(FIXTURES, 'ca.crt'), path.join(dir, 'ca.crt'));
}

function pem(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

function startFresh(prefix: string, portBase: number): Promise<{ cfgPath: string; port: number; sessionsPath: string }> {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.SWITCHBOARD_HOME = tmpDir;
  seedTls(path.join(tmpDir, 'tls'));
  const port = portBase + Math.floor(Math.random() * 3000);
  const cfgPath = path.join(tmpDir, 'daemon.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ port, host: '127.0.0.1' }));
  return Promise.resolve({ cfgPath, port, sessionsPath: path.join(tmpDir, 'sessions.json') });
}

function connectAndWaitForList(port: number): Promise<{ ws: WebSocket; list: { sessions: Array<{ id: string; name: string }> } }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}`, {
      cert: pem('client.crt'),
      key: pem('client.key'),
      ca: pem('ca.crt'),
    });
    ws.on('message', (data) => {
      const msg = deserializeMessage(data.toString()) as DaemonMessage;
      if (msg.type === 'session:list') {
        resolve({ ws, list: msg as { sessions: Array<{ id: string; name: string }> } as never });
      }
    });
    ws.on('error', reject);
  });
}

describe('Daemon (boot-time restore)', () => {
  it('respawns sessions from sessions.json with stable ids', async () => {
    const { cfgPath, port, sessionsPath } = await startFresh('sb-restore-', 32000);
    fs.mkdirSync(path.dirname(sessionsPath), { recursive: true });
    fs.writeFileSync(sessionsPath, JSON.stringify({
      sessions: [
        { id: 'restored-1', name: 'one', cwd: os.tmpdir(), command: '/bin/bash' },
        { id: 'restored-2', name: 'two', cwd: os.tmpdir(), command: '/bin/bash' },
      ],
    }));

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port);
    const ids = list.sessions.map((s) => s.id).sort();
    const names = list.sessions.map((s) => s.name).sort();
    expect(ids).toEqual(['restored-1', 'restored-2']);
    expect(names).toEqual(['one', 'two']);
    ws.close();
  }, 15000);

  it('skips sessions whose cwd is invalid and does not crash', async () => {
    const { cfgPath, port, sessionsPath } = await startFresh('sb-restore-bad-', 37000);
    fs.mkdirSync(path.dirname(sessionsPath), { recursive: true });
    fs.writeFileSync(sessionsPath, JSON.stringify({
      sessions: [
        { id: 'bad', name: 'bad', cwd: '/nonexistent/path/zzzz', command: '/bin/bash' },
        { id: 'good', name: 'good', cwd: os.tmpdir(), command: '/bin/bash' },
      ],
    }));

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port);
    const ids = list.sessions.map((s) => s.id);
    expect(ids).toContain('good');
    expect(ids.length).toBeGreaterThanOrEqual(1);
    ws.close();
  }, 15000);

  it('starts cleanly with an empty sessions.json', async () => {
    const { cfgPath, port } = await startFresh('sb-restore-empty-', 38000);

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port);
    expect(list.sessions).toEqual([]);
    ws.close();
  }, 15000);
});
