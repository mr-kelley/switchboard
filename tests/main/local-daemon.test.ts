import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: spawnMock };
});

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'linux' });

import { LocalDaemon } from '../../src/main/local-daemon';
import * as systemd from '../../src/main/systemd-installer';

let tmpHome: string;
let originalHome: string | undefined;
let originalSwitchboardHome: string | undefined;

function writeDaemonConfig(): { port: number } {
  const sbDir = path.join(tmpHome, '.switchboard');
  fs.mkdirSync(sbDir, { recursive: true });
  fs.writeFileSync(path.join(sbDir, 'daemon.json'), JSON.stringify({ port: 3717 }));
  return { port: 3717 };
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-localdaemon-'));
  originalHome = process.env.HOME;
  originalSwitchboardHome = process.env.SWITCHBOARD_HOME;
  process.env.HOME = tmpHome;
  process.env.SWITCHBOARD_HOME = path.join(tmpHome, '.switchboard');
  spawnMock.mockReset();
});

afterEach(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  if (originalSwitchboardHome === undefined) delete process.env.SWITCHBOARD_HOME;
  else process.env.SWITCHBOARD_HOME = originalSwitchboardHome;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  systemd.__setRunner(undefined);
});

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

describe('LocalDaemon service-detection branch', () => {
  it('skips child spawn when systemd service is installed and running', async () => {
    // Install a fake unit file
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    writeDaemonConfig();

    // Service reports active
    systemd.__setRunner(async (_cmd, args) => {
      if (args.includes('is-active')) return { stdout: 'active\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });

    const daemon = new LocalDaemon();
    const config = await daemon.start();

    expect(spawnMock).not.toHaveBeenCalled();
    expect(daemon.isServiceManaged()).toBe(true);
    expect(config.id).toBe('localhost');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3717);
    // token/fingerprint no longer part of DaemonConnectionConfig (DEC-000010)
  });

  it('stop() does not signal child when service-managed', async () => {
    const unitDir = path.join(tmpHome, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'switchboard-daemon.service'), 'stub');
    writeDaemonConfig();
    systemd.__setRunner(async () => ({ stdout: 'active\n', stderr: '' }));

    const daemon = new LocalDaemon();
    await daemon.start();

    daemon.stop();
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
