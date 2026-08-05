import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as ssh from './ssh-client';
import type { ConnectionManager } from './connection-manager';

/**
 * Under mTLS (DEC-000010) provisioning is a straight-line install: SSH
 * reachable → target has systemd --user → upload tarball + certs → extract
 * → install systemd unit → wait for daemon to accept connections → done.
 * The client then connects via the standard `connect()` path with its own
 * cert. There is no pairing dance; TLS is the sole auth boundary.
 */
export type StepId =
  | 'test-connection'
  | 'probe-target'
  | 'check-existing'
  | 'upload-tarball'
  | 'upload-certs'
  | 'extract'
  | 'install-service'
  | 'wait-ready'
  | 'connect-client'
  | 'cleanup';

export type StepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface StepState {
  id: StepId;
  label: string;
  status: StepStatus;
  message?: string;
  errorKind?: string;
  errorDetail?: string;
}

export interface ServerCertBundle {
  /** Absolute local path to the target's server cert (PEM). */
  serverCertPath: string;
  /** Absolute local path to the matching server key (PEM). */
  serverKeyPath: string;
  /** Absolute local path to the lab CA root cert (PEM). */
  caCertPath: string;
}

export interface ProvisionRequest {
  target: ssh.SshTarget;
  /** Human-friendly label for the daemon in the client (defaults to host). */
  daemonName?: string;
  /** Absolute path to the local switchboard-daemon-*.tar.gz built by dist:daemon-tarball. */
  tarballPath: string;
  /** Local port the daemon will listen on (matches its systemd unit). */
  daemonPort: number;
  /**
   * Local paths to the cert bundle the operator issued from the lab CA for
   * this target. The provisioner uploads them into the target's
   * ~/.switchboard/tls/ before starting the daemon.
   */
  certs: ServerCertBundle;
}

export type ProgressCallback = (state: readonly StepState[]) => void;

const REMOTE_INSTALL_ROOT = '~/.local/share/switchboard';
const REMOTE_TARBALL_TMP = '/tmp/switchboard-daemon.tar.gz';
const REMOTE_UNIT_PATH = '~/.config/systemd/user/switchboard-daemon.service';
const REMOTE_TLS_DIR = '~/.switchboard/tls';

const STEP_LABELS: Record<StepId, string> = {
  'test-connection': 'Test SSH connection',
  'probe-target': 'Probe target (resolve $HOME, check systemd --user)',
  'check-existing': 'Check for existing install',
  'upload-tarball': 'Upload daemon tarball',
  'upload-certs': 'Upload TLS certs',
  'extract': 'Extract tarball on target',
  'install-service': 'Install and enable systemd service',
  'wait-ready': 'Wait for daemon to accept connections',
  'connect-client': 'Connect this client to the daemon',
  'cleanup': 'Clean up temporary files',
};

const STEP_ORDER: StepId[] = [
  'test-connection', 'probe-target', 'check-existing',
  'upload-tarball', 'upload-certs',
  'extract', 'install-service', 'wait-ready',
  'connect-client', 'cleanup',
];

/**
 * systemd user unit for the mTLS daemon. Bundled Node runtime (DEC-000009);
 * cert dir is the well-known path under $HOME (`transport-mtls-spec.md`).
 */
function buildUnitFile(remoteHome: string): string {
  const installRoot = `${remoteHome}/.local/share/switchboard/switchboard-daemon`;
  const nodeBin = `${installRoot}/bin/node`;
  const daemonJs = `${installRoot}/dist/daemon/daemon/daemon.js`;
  const tlsDir = `${remoteHome}/.switchboard/tls`;
  return [
    '[Unit]',
    'Description=Switchboard daemon',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    // Dual-stack bind (see rc.9). mTLS + CA-validated client certs gate access;
    // there is no token or fingerprint pin to leak.
    'Environment=SWITCHBOARD_HOST=::',
    `Environment=SWITCHBOARD_TLS_DIR=${tlsDir}`,
    `ExecStart=${nodeBin} ${daemonJs}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

function safeHeredoc(marker: string, content: string): string {
  if (content.includes(`\n${marker}\n`)) {
    throw new Error(`heredoc marker "${marker}" collides with content`);
  }
  return `cat > "$FILE" <<'${marker}'\n${content}\n${marker}\n`;
}

export class RemoteProvisioner {
  private steps: StepState[];
  private cancelled = false;
  private probed: { remoteHome: string } | null = null;

  constructor(
    private req: ProvisionRequest,
    private connectionManager: ConnectionManager,
    private onProgress: ProgressCallback,
  ) {
    this.steps = STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: 'pending' }));
  }

  cancel(): void {
    this.cancelled = true;
  }

  getState(): readonly StepState[] {
    return this.steps.map((s) => ({ ...s }));
  }

  private setStep(id: StepId, patch: Partial<StepState>): void {
    const idx = this.steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    this.steps[idx] = { ...this.steps[idx], ...patch };
    this.emit();
  }

  private emit(): void {
    this.onProgress(this.getState());
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      const err = new Error('cancelled');
      (err as Error & { kind?: string }).kind = 'cancelled';
      throw err;
    }
  }

  async run(fromStep?: StepId): Promise<void> {
    const startIdx = fromStep ? STEP_ORDER.indexOf(fromStep) : 0;
    if (startIdx < 0) throw new Error(`unknown step: ${fromStep}`);
    for (let i = startIdx; i < STEP_ORDER.length; i++) {
      this.steps[i] = { id: STEP_ORDER[i], label: STEP_LABELS[STEP_ORDER[i]], status: 'pending' };
    }
    this.emit();

    for (let i = startIdx; i < STEP_ORDER.length; i++) {
      const id = STEP_ORDER[i];
      this.throwIfCancelled();
      this.setStep(id, { status: 'active' });
      try {
        await this.runStep(id);
        this.setStep(id, { status: 'done' });
      } catch (err) {
        const kind = (err instanceof ssh.SshError) ? err.kind : ((err as Error & { kind?: string }).kind ?? 'unknown');
        const detail = (err instanceof ssh.SshError) ? (err.stderr || err.message) : (err as Error).message;
        this.setStep(id, { status: 'failed', errorKind: kind, errorDetail: detail });
        throw err;
      }
    }
  }

  private async runStep(id: StepId): Promise<void> {
    switch (id) {
      case 'test-connection': return this.testConnection();
      case 'probe-target': return this.probeTarget();
      case 'check-existing': return this.checkExisting();
      case 'upload-tarball': return this.uploadTarball();
      case 'upload-certs': return this.uploadCerts();
      case 'extract': return this.extract();
      case 'install-service': return this.installService();
      case 'wait-ready': return this.waitReady();
      case 'connect-client': return this.connectClient();
      case 'cleanup': return this.cleanup();
    }
  }

  private async testConnection(): Promise<void> {
    await ssh.test(this.req.target);
    this.setStep('test-connection', { message: 'connected' });
  }

  private async probeTarget(): Promise<void> {
    const r = await ssh.run(
      this.req.target,
      'set -e; echo "$HOME"; systemctl --user is-system-running || true',
      { timeoutMs: 15_000 },
    );
    const lines = r.stdout.trim().split('\n').map((l) => l.trim());
    if (lines.length < 2) throw new Error(`probe output malformed: ${r.stdout}`);
    const [remoteHome, systemdStatus] = lines;

    if (!remoteHome.startsWith('/')) {
      throw new Error(`Could not resolve $HOME on target (got: ${JSON.stringify(remoteHome)})`);
    }
    if (!/^(running|degraded|starting)$/.test(systemdStatus)) {
      throw new Error(
        `systemd --user is not active on target (status: ${JSON.stringify(systemdStatus)}). ` +
        `You may need to enable lingering: sudo loginctl enable-linger ${this.req.target.user}`,
      );
    }
    this.probed = { remoteHome };
    this.setStep('probe-target', { message: `home=${remoteHome}, systemd=${systemdStatus}` });
  }

  private async checkExisting(): Promise<void> {
    const r = await ssh.run(
      this.req.target,
      'test -f ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js && echo yes || echo no',
    );
    const existing = r.stdout.trim() === 'yes';
    this.setStep('check-existing', {
      message: existing ? 'daemon files found — will overwrite' : 'no prior install found',
    });
  }

  private async uploadTarball(): Promise<void> {
    if (!fs.existsSync(this.req.tarballPath)) {
      throw new Error(`Local tarball not found: ${this.req.tarballPath}`);
    }
    await ssh.upload(this.req.target, this.req.tarballPath, REMOTE_TARBALL_TMP);
    const size = fs.statSync(this.req.tarballPath).size;
    this.setStep('upload-tarball', { message: `${(size / 1024).toFixed(0)} KB uploaded` });
  }

  private async uploadCerts(): Promise<void> {
    const { serverCertPath, serverKeyPath, caCertPath } = this.req.certs;
    for (const [label, p] of [
      ['server cert', serverCertPath],
      ['server key', serverKeyPath],
      ['CA cert', caCertPath],
    ] as const) {
      if (!fs.existsSync(p)) throw new Error(`Local ${label} not found: ${p}`);
    }

    // Ensure the remote TLS dir exists with tight perms before uploads land.
    await ssh.run(
      this.req.target,
      'mkdir -p ~/.switchboard/tls && chmod 700 ~/.switchboard ~/.switchboard/tls',
      { timeoutMs: 10_000 },
    );

    // Upload to a temp path first, then move into place under the right names
    // and perms in a single remote step.
    const tmpCert = '/tmp/sb-server.crt';
    const tmpKey = '/tmp/sb-server.key';
    const tmpCa = '/tmp/sb-ca.crt';
    await ssh.upload(this.req.target, serverCertPath, tmpCert);
    await ssh.upload(this.req.target, serverKeyPath, tmpKey);
    await ssh.upload(this.req.target, caCertPath, tmpCa);
    await ssh.run(
      this.req.target,
      `install -m 644 ${tmpCert} ${REMOTE_TLS_DIR}/server.crt && ` +
      `install -m 600 ${tmpKey} ${REMOTE_TLS_DIR}/server.key && ` +
      `install -m 644 ${tmpCa} ${REMOTE_TLS_DIR}/ca.crt && ` +
      `rm -f ${tmpCert} ${tmpKey} ${tmpCa}`,
      { timeoutMs: 10_000 },
    );
    this.setStep('upload-certs', { message: `installed to ${REMOTE_TLS_DIR}` });
  }

  private async extract(): Promise<void> {
    await ssh.run(
      this.req.target,
      'systemctl --user stop switchboard-daemon 2>/dev/null || true; ' +
      `mkdir -p ${REMOTE_INSTALL_ROOT} && rm -rf ${REMOTE_INSTALL_ROOT}/switchboard-daemon && ` +
      `tar -xzf ${REMOTE_TARBALL_TMP} -C ${REMOTE_INSTALL_ROOT} && rm -f ${REMOTE_TARBALL_TMP}`,
      { timeoutMs: 30_000 },
    );
    this.setStep('extract', { message: `extracted to ${REMOTE_INSTALL_ROOT}/switchboard-daemon` });
  }

  private async installService(): Promise<void> {
    if (!this.probed) throw new Error('installService called before probe-target populated remoteHome');
    const unit = buildUnitFile(this.probed.remoteHome);
    const marker = 'SB_UNIT_END';
    const script =
      'mkdir -p ~/.config/systemd/user && ' +
      `FILE=${REMOTE_UNIT_PATH} && ` +
      safeHeredoc(marker, unit) +
      'systemctl --user daemon-reload && ' +
      'systemctl --user enable switchboard-daemon && ' +
      'systemctl --user restart switchboard-daemon';
    await ssh.run(this.req.target, script, { timeoutMs: 30_000 });
    this.setStep('install-service', { message: 'service enabled and restarted' });
  }

  private async waitReady(): Promise<void> {
    const start = Date.now();
    const timeoutMs = 30_000;
    let lastError = '';
    while (Date.now() - start < timeoutMs) {
      this.throwIfCancelled();
      try {
        const r = await ssh.run(
          this.req.target,
          'systemctl --user is-active switchboard-daemon 2>&1 || true',
        );
        if (r.stdout.trim() === 'active') {
          const journal = await ssh.run(
            this.req.target,
            'journalctl --user -u switchboard-daemon -n 50 --no-pager || true',
          );
          if (journal.stdout.toLowerCase().includes('listening on') ||
              journal.stdout.toLowerCase().includes('daemon started') ||
              journal.stdout.includes('WebSocket server') ||
              journal.stdout.includes('Daemon ready.')) {
            this.setStep('wait-ready', { message: `ready (${((Date.now() - start) / 1000).toFixed(1)}s)` });
            return;
          }
          lastError = 'active but no "listening" marker in log';
        } else {
          lastError = `service state: ${r.stdout.trim()}`;
        }
      } catch (err) {
        lastError = (err as Error).message;
      }
      await sleep(500);
    }
    throw new Error(`daemon did not become ready within ${timeoutMs / 1000}s (${lastError})`);
  }

  private async connectClient(): Promise<void> {
    const { target } = this.req;
    const daemonName = this.req.daemonName || target.host;
    // Under mTLS this is a plain WS connect. The daemon's identity metadata
    // arrives via auth:ok and the ConnectionManager rekeys the provisional
    // config to the daemon's real daemonId at that point.
    this.connectionManager.addAndConnect(target.host, this.req.daemonPort, daemonName);
    this.setStep('connect-client', { message: 'client connect initiated' });
  }

  private async cleanup(): Promise<void> {
    await ssh.run(
      this.req.target,
      `rm -f ${REMOTE_TARBALL_TMP} 2>/dev/null || true`,
      { timeoutMs: 5_000 },
    );
    this.setStep('cleanup', { message: 'temp files removed' });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function defaultTarballPath(version: string): string {
  const versioned = `switchboard-daemon-${version}-linux-x64.tar.gz`;
  const stable = 'switchboard-daemon.tar.gz';

  const packagedStable = path.join(process.resourcesPath || '', stable);
  if (fs.existsSync(packagedStable)) return packagedStable;

  for (const name of [stable, versioned]) {
    const dev = path.join(app.getAppPath(), '..', '..', 'release', name);
    if (fs.existsSync(dev)) return dev;
    const cwd = path.join(process.cwd(), 'release', name);
    if (fs.existsSync(cwd)) return cwd;
  }

  return packagedStable;
}
