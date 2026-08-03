import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import type { DaemonConnectionConfig } from '../shared/types';
import * as systemd from './systemd-installer';

export const LOCALHOST_DAEMON_ID = 'localhost';

/**
 * Manages the local (per-machine) daemon child process. Under mTLS the local
 * daemon reads its cert bundle from `~/.switchboard/tls/` just like any other
 * daemon — there is no dev-mode shortcut. If the certs are missing, the
 * daemon exits with a specific error which we surface through the local-
 * daemon status UI.
 */
export class LocalDaemon {
  private process: ChildProcess | null = null;
  private stderrBuffer = '';
  private serviceManaged = false;
  private lastPort = 3717;

  async start(): Promise<DaemonConnectionConfig> {
    // If a systemd user service is installed and running, defer to it instead
    // of spawning a child. The client just connects to the existing daemon.
    if (systemd.isSupported() && systemd.isInstalled()) {
      const running = await systemd.isRunning();
      if (running) {
        this.serviceManaged = true;
        const port = this.readDaemonConfigPort();
        this.lastPort = port;
        return {
          id: LOCALHOST_DAEMON_ID,
          name: 'Localhost',
          host: '127.0.0.1',
          port,
          autoConnect: true,
        };
      }
    }

    const daemonScript = this.resolveDaemonScript();

    if (!fs.existsSync(daemonScript)) {
      throw new Error(`Daemon script not found at ${daemonScript}`);
    }

    this.process = spawn(process.execPath, [daemonScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[daemon] ${chunk.toString()}`);
    });
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.stderrBuffer += text;
      if (this.stderrBuffer.length > 8192) {
        this.stderrBuffer = this.stderrBuffer.slice(-8192);
      }
      process.stderr.write(`[daemon] ${text}`);
    });

    await this.waitForReady();

    const port = this.readDaemonConfigPort();
    this.lastPort = port;
    return {
      id: LOCALHOST_DAEMON_ID,
      name: 'Localhost',
      host: '127.0.0.1',
      port,
      autoConnect: true,
    };
  }

  /**
   * Whether the localhost daemon is managed by an external systemd service
   * (i.e., this instance did not spawn the daemon child).
   */
  isServiceManaged(): boolean {
    return this.serviceManaged;
  }

  /** Mark the localhost daemon as service-managed (called after a successful install). */
  markServiceManaged(): void {
    this.serviceManaged = true;
  }

  /** Absolute path to the daemon entry script for the current build. */
  getDaemonScriptPath(): string {
    return this.resolveDaemonScript();
  }

  /**
   * Stop the child daemon if we spawned one and wait for the OS to release the port.
   * No-op if service-managed or no child exists.
   */
  async stopChildAndWait(): Promise<void> {
    if (!this.process || this.serviceManaged) return;
    const proc = this.process;
    this.process = null;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      proc.once('exit', done);
      proc.kill('SIGTERM');
      setTimeout(done, 3000);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    // Service-managed daemons are intentionally left running on app quit.
  }

  private resolveDaemonScript(): string {
    if (app.isPackaged) {
      return path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'dist',
        'daemon',
        'daemon',
        'daemon.js'
      );
    }
    return path.join(__dirname, '..', '..', 'daemon', 'daemon', 'daemon.js');
  }

  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdout) {
        reject(new Error('No daemon process'));
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error('Daemon startup timeout'));
      }, 10_000);

      const onData = (chunk: Buffer) => {
        if (chunk.toString().includes('Daemon ready.')) {
          clearTimeout(timeout);
          this.process?.stdout?.off('data', onData);
          resolve();
        }
      };
      this.process.stdout.on('data', onData);

      this.process.once('exit', (code) => {
        clearTimeout(timeout);
        const tail = this.stderrBuffer.trim();
        // The daemon exits with a CertLoadError when TLS files are missing at
        // startup. Surface a targeted hint on top of the raw error so the
        // status UI can present something actionable.
        const isCertProblem = tail.includes('required TLS file not found') ||
          tail.includes('not a PEM file');
        const hint = isCertProblem
          ? ` — populate ${path.join(os.homedir(), '.switchboard', 'tls')} with server.crt, server.key, and ca.crt from your lab CA.`
          : '';
        const detail = tail ? `: ${tail}` : '';
        reject(new Error(`Daemon exited with code ${code}${detail}${hint}`));
      });
    });
  }

  private readDaemonConfigPort(): number {
    const dataDir = process.env.SWITCHBOARD_HOME || path.join(os.homedir(), '.switchboard');
    const configPath = path.join(dataDir, 'daemon.json');
    // The daemon writes its config on first run; if absent, we fall back to
    // the daemon default (3717). Under mTLS there are no cert paths or tokens
    // to read here — those live in ~/.switchboard/tls/ per the transport spec.
    if (!fs.existsSync(configPath)) return 3717;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { port?: number };
      return config.port ?? 3717;
    } catch {
      return 3717;
    }
  }
}
