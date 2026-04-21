import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { app } from 'electron';
import type { DaemonConnectionConfig } from './connection-manager';

export const LOCALHOST_DAEMON_ID = 'localhost';

export class LocalDaemon {
  private process: ChildProcess | null = null;

  async start(): Promise<DaemonConnectionConfig> {
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
      process.stderr.write(`[daemon] ${chunk.toString()}`);
    });

    await this.waitForReady();

    const config = this.readDaemonConfig();
    return {
      id: LOCALHOST_DAEMON_ID,
      name: 'Localhost',
      host: '127.0.0.1',
      port: config.port,
      token: config.auth.token,
      fingerprint: config.fingerprint,
      autoConnect: true,
    };
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
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
        reject(new Error(`Daemon exited with code ${code}`));
      });
    });
  }

  private readDaemonConfig(): { port: number; auth: { token: string }; fingerprint: string } {
    const dataDir = process.env.SWITCHBOARD_HOME || path.join(os.homedir(), '.switchboard');
    const configPath = path.join(dataDir, 'daemon.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const certPem = fs.readFileSync(config.tls.cert, 'utf-8');
    const fingerprint = crypto.createHash('sha256').update(certPem).digest('hex');
    return {
      port: config.port,
      auth: { token: config.auth.token },
      fingerprint,
    };
  }
}
