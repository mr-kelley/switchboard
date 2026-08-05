import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as ssh from '../../src/main/ssh-client';
import { RemoteProvisioner, type TargetArch } from '../../src/main/remote-provisioner';

/**
 * Post-DEC-000010: no pair-code dance. Post-DEC-000012: probe-target detects
 * the target arch and the provisioner uploads the matching per-arch tarball.
 * Tests inject a `resolveTarballPath` stub that points at a per-arch fake
 * tarball, so we exercise the arch-selection logic without seeding the
 * production defaultTarballPath search paths.
 */

let fakeCertDir: string;
let certPaths: { serverCertPath: string; serverKeyPath: string; caCertPath: string };
let fakeTarballs: Record<TargetArch, string>;

beforeEach(() => {
  // One fake tarball per supported arch — the stub resolver hands the
  // matching one back based on the probed arch.
  const tarballDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-provision-tarballs-'));
  fakeTarballs = {
    'linux-x64': path.join(tarballDir, 'switchboard-daemon-linux-x64.tar.gz'),
    'linux-arm64': path.join(tarballDir, 'switchboard-daemon-linux-arm64.tar.gz'),
    'linux-armv7l': path.join(tarballDir, 'switchboard-daemon-linux-armv7l.tar.gz'),
  };
  for (const p of Object.values(fakeTarballs)) fs.writeFileSync(p, 'fake');

  fakeCertDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-provision-certs-'));
  certPaths = {
    serverCertPath: path.join(fakeCertDir, 'server.crt'),
    serverKeyPath: path.join(fakeCertDir, 'server.key'),
    caCertPath: path.join(fakeCertDir, 'ca.crt'),
  };
  fs.writeFileSync(certPaths.serverCertPath, '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n');
  fs.writeFileSync(certPaths.serverKeyPath, '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n');
  fs.writeFileSync(certPaths.caCertPath, '-----BEGIN CERTIFICATE-----\nfakeca\n-----END CERTIFICATE-----\n');
});

afterEach(() => {
  for (const p of Object.values(fakeTarballs)) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  const tarballDir = path.dirname(fakeTarballs['linux-x64']);
  try { fs.rmdirSync(tarballDir); } catch { /* ignore */ }
  fs.rmSync(fakeCertDir, { recursive: true, force: true });
  ssh.__setRunner(null);
});

function fakeConnectionManager() {
  const cm = {
    addAndConnect: vi.fn().mockReturnValue('daemon-id'),
  };
  return cm as unknown as import('../../src/main/connection-manager').ConnectionManager & typeof cm;
}

function makeRunner(overrides: Record<string, string | ((args: string[]) => string | Error)> = {}): Array<{ cmd: string; args: string[] }> {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const runner: ssh.Runner = async (cmd, args) => {
    calls.push({ cmd, args });
    const remote = args[args.length - 1];
    for (const [key, val] of Object.entries(overrides)) {
      if (remote.includes(key)) {
        const out = typeof val === 'function' ? val(args) : val;
        if (out instanceof Error) throw out;
        return { stdout: out, stderr: '' };
      }
    }
    return { stdout: '', stderr: '' };
  };
  ssh.__setRunner(runner);
  return calls;
}

// Probe output is four lines: $HOME, systemctl status, uname -m, Linger.
function probeStdout(
  unameM: string,
  systemd = 'running',
  home = '/home/ubuntu',
  linger = 'yes',
): string {
  return `${home}\n${systemd}\n${unameM}\n${linger}`;
}

const target = { host: 'server.example.com', user: 'ubuntu', port: 22 };

function baseReq() {
  return { target, appVersion: '0.5.0-rc.13', daemonPort: 3717, certs: certPaths };
}

function makeProvisioner(cm = fakeConnectionManager()) {
  const resolver = (_v: string, arch: TargetArch) => fakeTarballs[arch];
  const p = new RemoteProvisioner(baseReq(), cm, () => {}, resolver);
  return { p, cm };
}

describe('RemoteProvisioner (mTLS + multi-arch)', () => {
  it('runs all steps in order on the happy x86_64 path', async () => {
    makeRunner({
      'uname -m': probeStdout('x86_64'),
      'test -f': 'no',
      'is-active switchboard-daemon': 'active',
      'journalctl': 'listening on :::3717 Daemon ready.',
    });
    const { p, cm } = makeProvisioner();
    await p.run();
    const steps = p.getState().map((s) => `${s.id}:${s.status}`);
    expect(steps).toEqual([
      'test-connection:done', 'probe-target:done', 'check-existing:done',
      'upload-tarball:done', 'upload-certs:done',
      'extract:done', 'install-service:done', 'wait-ready:done',
      'connect-client:done', 'cleanup:done',
    ]);
    expect(cm.addAndConnect).toHaveBeenCalledOnce();
    expect(cm.addAndConnect).toHaveBeenCalledWith('server.example.com', 3717, 'server.example.com');
    // probe-target message includes the resolved arch slug.
    const probeStep = p.getState().find((s) => s.id === 'probe-target')!;
    expect(probeStep.message).toContain('arch=linux-x64');
  });

  it.each([
    { uname: 'x86_64',  arch: 'linux-x64' },
    { uname: 'aarch64', arch: 'linux-arm64' },
    { uname: 'armv7l',  arch: 'linux-armv7l' },
  ] as const)('maps uname %s to arch %s and uploads the matching tarball', async ({ uname, arch }) => {
    makeRunner({
      'uname -m': probeStdout(uname),
      'test -f': 'no',
      'is-active switchboard-daemon': 'active',
      'journalctl': 'Daemon ready.',
    });
    // Track which tarball path is actually uploaded via the resolver.
    const resolvedPaths: string[] = [];
    const resolver = (_v: string, a: TargetArch) => {
      resolvedPaths.push(fakeTarballs[a]);
      return fakeTarballs[a];
    };
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {}, resolver);
    await p.run();
    expect(resolvedPaths).toEqual([fakeTarballs[arch]]);
    const uploadStep = p.getState().find((s) => s.id === 'upload-tarball')!;
    expect(uploadStep.message).toContain(arch);
  });

  it.each(['armv6l', 'i686', 'riscv64', 'mips'])(
    'fails probe-target with a clear message for unsupported arch %s',
    async (uname) => {
      makeRunner({ 'uname -m': probeStdout(uname) });
      const { p } = makeProvisioner();
      await expect(p.run()).rejects.toThrow(new RegExp(`unsupported target arch.*${uname}`));
      // Later steps should not be attempted.
      const later = p.getState().filter((s) =>
        ['upload-tarball', 'upload-certs', 'extract'].includes(s.id));
      expect(later.every((s) => s.status === 'pending')).toBe(true);
    },
  );

  it('rejects when systemctl --user is offline', async () => {
    makeRunner({ 'uname -m': probeStdout('x86_64', 'offline') });
    const { p } = makeProvisioner();
    await expect(p.run()).rejects.toThrow(/systemd --user is not active/);
  });

  it('rejects when $HOME is not an absolute path', async () => {
    makeRunner({ 'uname -m': probeStdout('x86_64', 'running', 'not-a-path') });
    const { p } = makeProvisioner();
    await expect(p.run()).rejects.toThrow(/Could not resolve \$HOME/);
  });

  it('rejects when probe output is truncated (missing linger line)', async () => {
    makeRunner({ 'uname -m': '/home/ubuntu\nrunning\nx86_64' });
    const { p } = makeProvisioner();
    await expect(p.run()).rejects.toThrow(/probe output malformed/);
  });

  it.each(['no', 'unknown'])(
    'rejects when user lingering is not enabled (Linger=%s)',
    async (linger) => {
      makeRunner({ 'uname -m': probeStdout('x86_64', 'running', '/home/ubuntu', linger) });
      const { p } = makeProvisioner();
      await expect(p.run()).rejects.toThrow(/lingering is not enabled.*loginctl enable-linger ubuntu/);
    },
  );

  it('rejects when a cert file is missing', async () => {
    fs.unlinkSync(certPaths.serverCertPath);
    makeRunner({
      'uname -m': probeStdout('x86_64'),
      'test -f': 'no',
    });
    const { p } = makeProvisioner();
    await expect(p.run()).rejects.toThrow(/Local server cert not found/);
  });

  it('rejects when the per-arch tarball is missing from the client', async () => {
    // Simulate an AppImage that shipped without the arm64 tarball — the
    // resolver returns a bogus path and fs.existsSync fails.
    makeRunner({
      'uname -m': probeStdout('aarch64'),
      'test -f': 'no',
    });
    const cm = fakeConnectionManager();
    const missingResolver = (_v: string, _a: TargetArch) => '/does/not/exist.tar.gz';
    const p = new RemoteProvisioner(baseReq(), cm, () => {}, missingResolver);
    await expect(p.run()).rejects.toThrow(/Local tarball not found for linux-arm64/);
  });

  it('can be cancelled mid-run', async () => {
    makeRunner({ 'uname -m': probeStdout('x86_64') });
    const { p } = makeProvisioner();
    p.cancel();
    await expect(p.run()).rejects.toThrow(/cancelled/);
  });

  it('fails wait-ready when daemon never becomes active', async () => {
    makeRunner({
      'uname -m': probeStdout('x86_64'),
      'test -f': 'no',
      'is-active switchboard-daemon': 'inactive',
    });
    const { p } = makeProvisioner();
    setTimeout(() => p.cancel(), 500);
    await expect(p.run()).rejects.toThrow(/cancelled|did not become ready/);
  }, 10_000);
});
