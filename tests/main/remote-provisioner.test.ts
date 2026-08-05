import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as ssh from '../../src/main/ssh-client';
import { RemoteProvisioner } from '../../src/main/remote-provisioner';

/**
 * Post-DEC-000010: the provisioner no longer runs a pair-code dance. It
 * uploads the daemon tarball, the operator-supplied cert bundle, installs
 * the systemd unit, waits for the daemon to listen, then hands off to the
 * ConnectionManager for the mTLS handshake.
 */

let fakeTarball: string;
let fakeCertDir: string;
let certPaths: { serverCertPath: string; serverKeyPath: string; caCertPath: string };

beforeEach(() => {
  fakeTarball = path.join(os.tmpdir(), `switchboard-daemon-test-${Date.now()}.tar.gz`);
  fs.writeFileSync(fakeTarball, 'fake');

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
  try { fs.unlinkSync(fakeTarball); } catch { /* ignore */ }
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

const goodProbe = '/home/ubuntu\nrunning';
const target = { host: 'server.example.com', user: 'ubuntu', port: 22 };

function baseReq() {
  return { target, tarballPath: fakeTarball, daemonPort: 3717, certs: certPaths };
}

describe('RemoteProvisioner (mTLS)', () => {
  it('runs all steps in order on the happy path', async () => {
    makeRunner({
      'echo "$HOME"': goodProbe,
      'test -f': 'no',
      'is-active switchboard-daemon': 'active',
      'journalctl': 'listening on :::3717 Daemon ready.',
    });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
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
  });

  it('rejects when systemctl --user is offline', async () => {
    makeRunner({ 'echo "$HOME"': '/home/ubuntu\noffline' });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
    await expect(p.run()).rejects.toThrow(/systemd --user is not active/);
  });

  it('rejects when $HOME is not an absolute path', async () => {
    makeRunner({ 'echo "$HOME"': 'not-a-path\nrunning' });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
    await expect(p.run()).rejects.toThrow(/Could not resolve \$HOME/);
  });

  it('rejects when a cert file is missing', async () => {
    fs.unlinkSync(certPaths.serverCertPath);
    makeRunner({
      'echo "$HOME"': goodProbe,
      'test -f': 'no',
    });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
    await expect(p.run()).rejects.toThrow(/Local server cert not found/);
  });

  it('can be cancelled mid-run', async () => {
    makeRunner({ 'echo "$HOME"': goodProbe });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
    p.cancel();
    await expect(p.run()).rejects.toThrow(/cancelled/);
  });

  it('fails wait-ready when daemon never becomes active', async () => {
    makeRunner({
      'echo "$HOME"': goodProbe,
      'test -f': 'no',
      'is-active switchboard-daemon': 'inactive',
    });
    const cm = fakeConnectionManager();
    const p = new RemoteProvisioner(baseReq(), cm, () => {});
    setTimeout(() => p.cancel(), 500);
    await expect(p.run()).rejects.toThrow(/cancelled|did not become ready/);
  }, 10_000);
});
