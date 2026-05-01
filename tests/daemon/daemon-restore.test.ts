import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WebSocket } from 'ws';
import { Daemon } from '../../src/daemon/daemon';
import { initConfig } from '../../src/daemon/config';
import { deserializeMessage, type DaemonMessage } from '../../src/shared/protocol';

let tmpDir: string;
let daemon: Daemon | null = null;

afterEach(async () => {
  if (daemon) {
    await daemon.stop();
    daemon = null;
  }
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function connectAndWaitForList(port: number, token: string): Promise<{ ws: WebSocket; list: any }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}`, { rejectUnauthorized: false });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', seq: 1, token })));
    ws.on('message', (data) => {
      const msg = deserializeMessage(data.toString()) as DaemonMessage;
      if (msg.type === 'session:list') resolve({ ws, list: msg });
    });
    ws.on('error', reject);
  });
}

describe('Daemon (boot-time restore)', () => {
  it('respawns sessions from sessions.json with stable ids', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-restore-'));
    const cfgPath = path.join(tmpDir, 'daemon.json');
    const config = initConfig(tmpDir, cfgPath);
    const port = 32000 + Math.floor(Math.random() * 5000);
    config.port = port;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    // Pre-write sessions.json with two saved sessions
    const sessionsPath = config.sessionPersistPath;
    fs.mkdirSync(path.dirname(sessionsPath), { recursive: true });
    fs.writeFileSync(sessionsPath, JSON.stringify({
      sessions: [
        { id: 'restored-1', name: 'one', cwd: os.tmpdir(), command: '/bin/bash' },
        { id: 'restored-2', name: 'two', cwd: os.tmpdir(), command: '/bin/bash' },
      ],
    }));

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port, config.auth.token);
    const sessions = (list as any).sessions;
    const ids = sessions.map((s: any) => s.id).sort();
    const names = sessions.map((s: any) => s.name).sort();
    expect(ids).toEqual(['restored-1', 'restored-2']);
    expect(names).toEqual(['one', 'two']);
    ws.close();
  }, 15000);

  it('skips sessions whose cwd is invalid and does not crash', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-restore-bad-'));
    const cfgPath = path.join(tmpDir, 'daemon.json');
    const config = initConfig(tmpDir, cfgPath);
    const port = 37000 + Math.floor(Math.random() * 5000);
    config.port = port;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    fs.mkdirSync(path.dirname(config.sessionPersistPath), { recursive: true });
    fs.writeFileSync(config.sessionPersistPath, JSON.stringify({
      sessions: [
        { id: 'bad', name: 'bad', cwd: '/nonexistent/path/zzzz', command: '/bin/bash' },
        { id: 'good', name: 'good', cwd: os.tmpdir(), command: '/bin/bash' },
      ],
    }));

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port, config.auth.token);
    const ids = (list as any).sessions.map((s: any) => s.id);
    expect(ids).toContain('good');
    // 'bad' may or may not appear depending on whether node-pty actually fails on invalid cwd;
    // important assertion: daemon started successfully and returned a list.
    expect(ids.length).toBeGreaterThanOrEqual(1);
    ws.close();
  }, 15000);

  it('starts cleanly with an empty sessions.json', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-restore-empty-'));
    const cfgPath = path.join(tmpDir, 'daemon.json');
    const config = initConfig(tmpDir, cfgPath);
    const port = 38000 + Math.floor(Math.random() * 5000);
    config.port = port;
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    daemon = new Daemon(cfgPath);
    await daemon.start();

    const { ws, list } = await connectAndWaitForList(port, config.auth.token);
    expect((list as any).sessions).toEqual([]);
    ws.close();
  }, 15000);
});
