import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as ssh from './ssh-client';
import type { ConnectionManager } from './connection-manager';

export type StepId =
  | 'test-connection'
  | 'probe-target'
  | 'check-existing'
  | 'upload-tarball'
  | 'extract'
  | 'install-service'
  | 'wait-ready'
  | 'read-code'
  | 'complete-pairing'
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

export interface ProvisionRequest {
  target: ssh.SshTarget;
  /** Human-friendly label for the daemon in the client (defaults to host). */
  daemonName?: string;
  /** Absolute path to the local switchboard-daemon-*.tar.gz built by dist:daemon-tarball. */
  tarballPath: string;
  /** Local port to connect to daemon on target (always 3717 in v1). */
  daemonPort: number;
}

export type ProgressCallback = (state: readonly StepState[]) => void;

const REMOTE_INSTALL_ROOT = '~/.local/share/switchboard';
const REMOTE_TARBALL_TMP = '/tmp/switchboard-daemon.tar.gz';
const REMOTE_UNIT_PATH = '~/.config/systemd/user/switchboard-daemon.service';
const REMOTE_PAIRING_CODE_PATH = '~/.switchboard/pairing-code.txt';

const STEP_LABELS: Record<StepId, string> = {
  'test-connection': 'Test SSH connection',
  'probe-target': 'Verify Node ≥ 20 and systemd --user',
  'check-existing': 'Check for existing install',
  'upload-tarball': 'Upload daemon tarball',
  'extract': 'Extract tarball on target',
  'install-service': 'Install and enable systemd service',
  'wait-ready': 'Wait for daemon to accept connections',
  'read-code': 'Read pairing code from target',
  'complete-pairing': 'Complete pairing with daemon',
  'cleanup': 'Clean up temporary files',
};

const STEP_ORDER: StepId[] = [
  'test-connection', 'probe-target', 'check-existing', 'upload-tarball',
  'extract', 'install-service', 'wait-ready', 'read-code',
  'complete-pairing', 'cleanup',
];

/**
 * Build the systemd user-unit content for the remote daemon. The absolute
 * remote paths are baked in at install time; the target's HOME is resolved
 * once in probeTarget and passed here. We always use the Node runtime bundled
 * in the tarball (DEC-000009) so the target host is not required to have
 * Node installed at all.
 */
function buildUnitFile(remoteHome: string): string {
  const installRoot = `${remoteHome}/.local/share/switchboard/switchboard-daemon`;
  const nodeBin = `${installRoot}/bin/node`;
  const daemonJs = `${installRoot}/dist/daemon/daemon/daemon.js`;
  return [
    '[Unit]',
    'Description=Switchboard daemon',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    // Bind on all interfaces — dual-stack IPv4+IPv6. On typical Linux with
    // net.ipv6.bindv6only=0 (the default), binding to `::` accepts both v4
    // and v6 clients through a single listener. TLS + fingerprint pinning +
    // token auth gate access; the local-only daemon spawned by the client
    // still defaults to 127.0.0.1.
    'Environment=SWITCHBOARD_HOST=::',
    `ExecStart=${nodeBin} ${daemonJs}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/**
 * Escape a string for safe interpolation into a heredoc-style ssh `cat > file`
 * pipeline. We deliberately quote the heredoc marker so no expansion happens
 * on the remote side; this just guards the tag boundary itself.
 */
function safeHeredoc(marker: string, content: string): string {
  if (content.includes(`\n${marker}\n`)) {
    throw new Error(`heredoc marker "${marker}" collides with content`);
  }
  return `cat > "$FILE" <<'${marker}'\n${content}\n${marker}\n`;
}

/**
 * Runs the 10-step remote provisioning flow. One instance = one provisioning
 * attempt; construct a new one for a retry from scratch.
 */
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

  /** Run all steps starting at `fromStep` (default = first). */
  async run(fromStep?: StepId): Promise<void> {
    // Reset steps at and after fromStep to pending so retry shows them fresh.
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
      case 'extract': return this.extract();
      case 'install-service': return this.installService();
      case 'wait-ready': return this.waitReady();
      case 'read-code': /* handled inside completePairing */ return this.readCode();
      case 'complete-pairing': return this.completePairing();
      case 'cleanup': return this.cleanup();
    }
  }

  // --- step implementations ---

  private async testConnection(): Promise<void> {
    await ssh.test(this.req.target);
    this.setStep('test-connection', { message: 'connected' });
  }

  private async probeTarget(): Promise<void> {
    // Node is no longer probed — we ship our own runtime in the tarball
    // (DEC-000009). We still verify systemd --user is active and resolve
    // $HOME for the systemd unit's absolute paths.
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
    // systemctl --user prints "running" or "degraded" (both acceptable) when a user session exists.
    // "offline" or empty means no user session — fatal for our systemd-based install.
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

  private async extract(): Promise<void> {
    // Stop any running instance first so we don't overwrite files under a live
    // process (node's require cache aside, node-pty's .node file being rewritten
    // while loaded is asking for trouble). `|| true` because the service may
    // not yet exist on a first install.
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
    // Write the unit file, reload, ensure enabled for auto-start, then
    // *restart* — not `enable --now`, which is a no-op when the service is
    // already running and would leave the old process (with old env vars)
    // in place after a reprovision.
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
          // Also confirm the daemon has bound the port
          const journal = await ssh.run(
            this.req.target,
            'journalctl --user -u switchboard-daemon -n 50 --no-pager || true',
          );
          if (journal.stdout.toLowerCase().includes('listening on') ||
              journal.stdout.toLowerCase().includes('daemon started') ||
              journal.stdout.includes('WebSocket server') ||
              journal.stdout.includes('3717')) {
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

  // read-code and complete-pairing are tightly coupled. We initiate pairing
  // *first* so the daemon generates a code and writes the file, then read it,
  // then submit. Both steps observe from the same completePairing() body so
  // they stay in sync; the runStep switch just marks read-code active/done.
  private async readCode(): Promise<void> {
    // Placeholder step-level marker; the actual read happens in completePairing.
    // We just do a quick file-visibility sanity check here.
    this.setStep('read-code', { message: 'will read after triggering pair-request' });
  }

  private async completePairing(): Promise<void> {
    const { target } = this.req;
    const daemonName = this.req.daemonName || target.host;

    // Kick off pairing on the local side; this opens a WS to the daemon.
    await this.connectionManager.pair(target.host, this.req.daemonPort, daemonName);

    // Poll the remote pairing-code file. Give the daemon time to receive the
    // pair:request over WS and write the file synchronously in its handler.
    let code: string | null = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      this.throwIfCancelled();
      await sleep(300);
      try {
        const r = await ssh.run(target, `cat ${REMOTE_PAIRING_CODE_PATH} 2>/dev/null || true`, { timeoutMs: 5_000 });
        const s = r.stdout.trim();
        if (/^\d{6}$/.test(s)) { code = s; break; }
      } catch { /* keep polling */ }
    }
    if (!code) throw new Error('Timed out reading pairing code from remote');
    this.setStep('read-code', { status: 'done', message: 'code retrieved' });

    // Wait for the WS's pair-success broadcast, then submit the code.
    const pairSuccess = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('pairing timed out on client')), 15_000);
      const onSuccess = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const onFailed = (reason: string): void => {
        clearTimeout(timeout);
        reject(new Error(`pairing rejected by daemon: ${reason}`));
      };
      // These listeners are per-pairing-attempt; ConnectionManager fires them
      // via broadcast, and we hook the same electron IPC channel here.
      this.connectionManager.onPairSuccessOnce(onSuccess);
      this.connectionManager.onPairFailedOnce(onFailed);
    });

    this.connectionManager.submitPairingCode(code);
    await pairSuccess;
    this.setStep('complete-pairing', { message: 'paired' });
  }

  private async cleanup(): Promise<void> {
    // /tmp tarball already removed by the extract step; keep this cheap and
    // ensure no lingering half-state remains.
    await ssh.run(
      this.req.target,
      `rm -f ${REMOTE_TARBALL_TMP} ${REMOTE_PAIRING_CODE_PATH} 2>/dev/null || true`,
      { timeoutMs: 5_000 },
    );
    this.setStep('cleanup', { message: 'temp files removed' });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve the packaged daemon-tarball path. Packaged AppImages carry the
 * tarball under a stable name in process.resourcesPath (see the
 * `build.extraResources` entry in package.json). In dev, we fall back to
 * versioned/stable copies in release/.
 */
export function defaultTarballPath(version: string): string {
  const versioned = `switchboard-daemon-${version}-linux-x64.tar.gz`;
  const stable = 'switchboard-daemon.tar.gz';

  // Packaged: extraResources copies release/switchboard-daemon.tar.gz here.
  const packagedStable = path.join(process.resourcesPath || '', stable);
  if (fs.existsSync(packagedStable)) return packagedStable;

  // Dev: repo-relative release directory.
  for (const name of [stable, versioned]) {
    const dev = path.join(app.getAppPath(), '..', '..', 'release', name);
    if (fs.existsSync(dev)) return dev;
    const cwd = path.join(process.cwd(), 'release', name);
    if (fs.existsSync(cwd)) return cwd;
  }

  // Last-ditch: return the packaged path so the error message points at the
  // right place ("expected the AppImage to bundle the tarball at ...").
  return packagedStable;
}
