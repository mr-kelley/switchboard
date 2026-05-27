import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type ExecRunner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: ExecRunner = (cmd, args) =>
  new Promise((resolve, reject) => {
    cp.execFile(cmd, args, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });

let execFileAsync: ExecRunner = defaultRunner;

/** Test seam: replace the systemctl runner. Pass undefined to reset to default. */
export function __setRunner(runner: ExecRunner | undefined): void {
  execFileAsync = runner ?? defaultRunner;
}

export const SERVICE_NAME = 'switchboard-daemon';
const UNIT_FILENAME = `${SERVICE_NAME}.service`;

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  pid?: number;
  /** True when the host environment cannot support install (e.g., AppImage). */
  installBlocked?: boolean;
  /** Human-readable explanation of why install is blocked. */
  installBlockedReason?: string;
}

export interface InstallParams {
  /** Absolute path to the daemon entry script (daemon.js). */
  daemonScript: string;
  /** Node/Electron binary that will execute the script. */
  execBinary: string;
  /** If true, set ELECTRON_RUN_AS_NODE=1 (required when execBinary is Electron). */
  electronAsNode: boolean;
  /** Optional SWITCHBOARD_HOME override; defaults to ~/.switchboard. */
  dataDir?: string;
}

function unitFilePath(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user', UNIT_FILENAME);
}

export function isSupported(): boolean {
  return process.platform === 'linux';
}

export function isInstalled(): boolean {
  return fs.existsSync(unitFilePath());
}

export async function isRunning(): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['--user', 'is-active', SERVICE_NAME]);
    return true;
  } catch {
    return false;
  }
}

async function getMainPid(): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user',
      'show',
      SERVICE_NAME,
      '--property=MainPID',
      '--value',
    ]);
    const pid = parseInt(stdout.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

export async function getStatus(): Promise<ServiceStatus> {
  if (!isSupported()) return { installed: false, running: false };
  const installed = isInstalled();
  if (!installed) return { installed: false, running: false };
  const running = await isRunning();
  const pid = running ? await getMainPid() : undefined;
  return { installed, running, pid };
}

export function renderUnitFile(params: InstallParams): string {
  const { daemonScript, execBinary, electronAsNode, dataDir } = params;
  const envLines: string[] = [];
  if (electronAsNode) envLines.push('Environment=ELECTRON_RUN_AS_NODE=1');
  if (dataDir) envLines.push(`Environment=SWITCHBOARD_HOME=${dataDir}`);

  return [
    '[Unit]',
    'Description=Switchboard daemon',
    'After=default.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${execBinary} ${daemonScript}`,
    'Restart=on-failure',
    'RestartSec=2',
    ...envLines,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

export async function install(params: InstallParams): Promise<void> {
  if (!isSupported()) throw new Error('systemd user service is Linux-only');
  if (!path.isAbsolute(params.daemonScript)) {
    throw new Error('daemonScript must be absolute');
  }
  if (!path.isAbsolute(params.execBinary)) {
    throw new Error('execBinary must be absolute');
  }
  if (!fs.existsSync(params.daemonScript)) {
    throw new Error(`daemon script not found: ${params.daemonScript}`);
  }

  const unitPath = unitFilePath();
  fs.mkdirSync(path.dirname(unitPath), { recursive: true });
  fs.writeFileSync(unitPath, renderUnitFile(params), 'utf-8');

  await execFileAsync('systemctl', ['--user', 'daemon-reload']);
  await execFileAsync('systemctl', ['--user', 'enable', '--now', SERVICE_NAME]);
}

export async function uninstall(): Promise<void> {
  if (!isSupported()) throw new Error('systemd user service is Linux-only');
  try {
    await execFileAsync('systemctl', ['--user', 'disable', '--now', SERVICE_NAME]);
  } catch {
    // Service may not be enabled / running; continue
  }
  const unitPath = unitFilePath();
  if (fs.existsSync(unitPath)) fs.unlinkSync(unitPath);
  try {
    await execFileAsync('systemctl', ['--user', 'daemon-reload']);
  } catch {
    // daemon-reload after removal is best-effort
  }
}

export async function start(): Promise<void> {
  if (!isSupported()) throw new Error('systemd user service is Linux-only');
  await execFileAsync('systemctl', ['--user', 'start', SERVICE_NAME]);
}

export async function stop(): Promise<void> {
  if (!isSupported()) throw new Error('systemd user service is Linux-only');
  await execFileAsync('systemctl', ['--user', 'stop', SERVICE_NAME]);
}

export async function restart(): Promise<void> {
  if (!isSupported()) throw new Error('systemd user service is Linux-only');
  await execFileAsync('systemctl', ['--user', 'restart', SERVICE_NAME]);
}

export const __testing__ = { unitFilePath };
