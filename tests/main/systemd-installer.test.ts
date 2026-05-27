import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'linux' });

import * as systemd from '../../src/main/systemd-installer';

interface ExecCall { cmd: string; args: string[] }
let calls: ExecCall[] = [];
let runner: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

function setRunner(fn: typeof runner): void {
  runner = fn;
  systemd.__setRunner((cmd, args) => {
    calls.push({ cmd, args });
    return fn(cmd, args);
  });
}

function runnerOk(stdout = ''): typeof runner {
  return async () => ({ stdout, stderr: '' });
}

function runnerFail(): typeof runner {
  return async () => { throw new Error('exit 1'); };
}

let tmpHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-systemd-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  calls = [];
  setRunner(runnerOk());
});

afterEach(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  systemd.__setRunner(undefined);
});

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

describe('systemd-installer.renderUnitFile', () => {
  it('produces a minimal valid unit file', () => {
    const text = systemd.renderUnitFile({
      daemonScript: '/opt/sb/daemon.js',
      execBinary: '/usr/bin/node',
      electronAsNode: false,
    });
    expect(text).toContain('[Unit]');
    expect(text).toContain('Description=Switchboard daemon');
    expect(text).toContain('ExecStart=/usr/bin/node /opt/sb/daemon.js');
    expect(text).toContain('Restart=on-failure');
    expect(text).toContain('WantedBy=default.target');
    expect(text).not.toContain('ELECTRON_RUN_AS_NODE');
  });

  it('includes ELECTRON_RUN_AS_NODE when electronAsNode is true', () => {
    const text = systemd.renderUnitFile({
      daemonScript: '/opt/sb/daemon.js',
      execBinary: '/opt/sb/electron',
      electronAsNode: true,
    });
    expect(text).toContain('Environment=ELECTRON_RUN_AS_NODE=1');
  });

  it('includes SWITCHBOARD_HOME when dataDir is provided', () => {
    const text = systemd.renderUnitFile({
      daemonScript: '/opt/sb/daemon.js',
      execBinary: '/usr/bin/node',
      electronAsNode: false,
      dataDir: '/var/lib/switchboard',
    });
    expect(text).toContain('Environment=SWITCHBOARD_HOME=/var/lib/switchboard');
  });
});

describe('systemd-installer.isInstalled / getStatus', () => {
  it('isInstalled returns false when unit file is absent', () => {
    expect(systemd.isInstalled()).toBe(false);
  });

  it('isInstalled returns true when unit file is present', () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    expect(systemd.isInstalled()).toBe(true);
  });

  it('getStatus returns installed=false when no unit file', async () => {
    const status = await systemd.getStatus();
    expect(status).toEqual({ installed: false, running: false });
  });

  it('getStatus returns running=true and pid when active', async () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    setRunner(async (_cmd, args) => {
      if (args.includes('is-active')) return { stdout: 'active\n', stderr: '' };
      if (args.includes('show')) return { stdout: '12345\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });

    const status = await systemd.getStatus();
    expect(status.installed).toBe(true);
    expect(status.running).toBe(true);
    expect(status.pid).toBe(12345);
  });

  it('getStatus returns running=false when is-active fails', async () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    setRunner(runnerFail());
    const status = await systemd.getStatus();
    expect(status.running).toBe(false);
    expect(status.pid).toBeUndefined();
  });
});

describe('systemd-installer.install', () => {
  it('writes unit file and runs daemon-reload + enable --now', async () => {
    const daemonScript = path.join(tmpHome, 'daemon.js');
    fs.writeFileSync(daemonScript, '// stub');

    await systemd.install({
      daemonScript,
      execBinary: '/usr/bin/node',
      electronAsNode: false,
    });

    const unitPath = path.join(tmpHome, '.config', 'systemd', 'user', 'switchboard-daemon.service');
    expect(fs.existsSync(unitPath)).toBe(true);
    const content = fs.readFileSync(unitPath, 'utf-8');
    expect(content).toContain(`ExecStart=/usr/bin/node ${daemonScript}`);

    expect(calls.some((c) => c.args[0] === '--user' && c.args[1] === 'daemon-reload')).toBe(true);
    expect(calls.some((c) => c.args.includes('enable') && c.args.includes('--now'))).toBe(true);
  });

  it('rejects relative paths', async () => {
    await expect(systemd.install({
      daemonScript: 'daemon.js',
      execBinary: '/usr/bin/node',
      electronAsNode: false,
    })).rejects.toThrow(/absolute/);
  });

  it('rejects when daemonScript does not exist', async () => {
    await expect(systemd.install({
      daemonScript: '/nonexistent/path/daemon.js',
      execBinary: '/usr/bin/node',
      electronAsNode: false,
    })).rejects.toThrow(/not found/);
  });
});

describe('systemd-installer.uninstall', () => {
  it('removes the unit file and runs disable --now + daemon-reload', async () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    const unitPath = path.join(unitDir, 'switchboard-daemon.service');
    fs.writeFileSync(unitPath, 'stub');

    await systemd.uninstall();

    expect(fs.existsSync(unitPath)).toBe(false);
    expect(calls.some((c) => c.args.includes('disable') && c.args.includes('--now'))).toBe(true);
    expect(calls.some((c) => c.args.includes('daemon-reload'))).toBe(true);
  });

  it('does not throw when service was never enabled', async () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    let n = 0;
    setRunner(async () => {
      n++;
      if (n === 1) throw new Error('not enabled');
      return { stdout: '', stderr: '' };
    });
    await expect(systemd.uninstall()).resolves.toBeUndefined();
  });
});

describe('systemd-installer.start/stop/restart', () => {
  it('start calls systemctl --user start', async () => {
    await systemd.start();
    expect(calls[0]).toEqual({ cmd: 'systemctl', args: ['--user', 'start', 'switchboard-daemon'] });
  });

  it('stop calls systemctl --user stop', async () => {
    await systemd.stop();
    expect(calls[0]).toEqual({ cmd: 'systemctl', args: ['--user', 'stop', 'switchboard-daemon'] });
  });

  it('restart calls systemctl --user restart', async () => {
    await systemd.restart();
    expect(calls[0]).toEqual({ cmd: 'systemctl', args: ['--user', 'restart', 'switchboard-daemon'] });
  });
});
