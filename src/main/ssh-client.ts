import { execFile, type ExecFileOptions } from 'child_process';

export type Runner = (
  cmd: string,
  args: string[],
  options: ExecFileOptions & { input?: string },
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: Runner = (cmd, args, options) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { ...options, encoding: 'utf8' } as ExecFileOptions & { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
        e.stdout = String(stdout ?? '');
        e.stderr = String(stderr ?? '');
        reject(e);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
    if (options.input !== undefined && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });

let _runner: Runner = defaultRunner;
export function __setRunner(fn: Runner | null): void {
  _runner = fn ?? defaultRunner;
}

export interface SshTarget {
  host: string;
  user: string;
  port: number;
  identityFile?: string;
  /** Extra `-o Name=value` pairs; keys/values validated for safety. */
  options?: Record<string, string>;
}

export type SshErrorKind =
  | 'unreachable'
  | 'auth-failed'
  | 'host-key-mismatch'
  | 'host-key-unknown'
  | 'command-failed'
  | 'timeout'
  | 'ssh-missing'
  | 'invalid-input'
  | 'unknown';

export class SshError extends Error {
  readonly kind: SshErrorKind;
  readonly stderr: string;
  readonly stdout: string;
  readonly exitCode: number | null;
  constructor(kind: SshErrorKind, message: string, opts: { stderr?: string; stdout?: string; exitCode?: number | null } = {}) {
    super(message);
    this.name = 'SshError';
    this.kind = kind;
    this.stderr = opts.stderr ?? '';
    this.stdout = opts.stdout ?? '';
    this.exitCode = opts.exitCode ?? null;
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

// The full set of characters we permit in hostnames, usernames, and options.
// Hostnames: RFC-952/1123 subset + IPv6-safe brackets; usernames: POSIX.
const HOST_RE = /^[a-zA-Z0-9._:\-\[\]]+$/;
const USER_RE = /^[a-zA-Z0-9._\-]+$/;
const OPT_KEY_RE = /^[A-Za-z][A-Za-z0-9]*$/;
const OPT_VAL_RE = /^[A-Za-z0-9._\/=+\-]+$/;

function validateTarget(t: SshTarget): void {
  if (!HOST_RE.test(t.host)) throw new SshError('invalid-input', `invalid host: ${JSON.stringify(t.host)}`);
  if (!USER_RE.test(t.user)) throw new SshError('invalid-input', `invalid user: ${JSON.stringify(t.user)}`);
  if (!Number.isInteger(t.port) || t.port < 1 || t.port > 65535) {
    throw new SshError('invalid-input', `invalid port: ${t.port}`);
  }
  if (t.identityFile !== undefined && !/^[\w./\-]+$/.test(t.identityFile)) {
    throw new SshError('invalid-input', `invalid identityFile path: ${JSON.stringify(t.identityFile)}`);
  }
  if (t.options) {
    for (const [k, v] of Object.entries(t.options)) {
      if (!OPT_KEY_RE.test(k) || !OPT_VAL_RE.test(v)) {
        throw new SshError('invalid-input', `invalid ssh option: ${k}=${v}`);
      }
    }
  }
}

/**
 * Build the shared `-o` / `-p` / `-i` prefix that both `ssh` and `scp` accept.
 * Note: `scp` takes `-P` (uppercase) for port instead; caller handles that.
 */
function baseOptions(t: SshTarget): string[] {
  const opts: string[] = [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'ServerAliveInterval=10',
    '-o', 'ServerAliveCountMax=3',
  ];
  for (const [k, v] of Object.entries(t.options ?? {})) {
    opts.push('-o', `${k}=${v}`);
  }
  if (t.identityFile) {
    opts.push('-o', 'IdentitiesOnly=yes', '-i', t.identityFile);
  }
  return opts;
}

/**
 * Classify a raw stderr blob from ssh/scp into a typed error kind. Called only
 * when the child exited non-zero.
 */
export function classifyStderr(stderr: string): SshErrorKind {
  const s = stderr.toLowerCase();
  if (s.includes('remote host identification has changed') ||
      s.includes('host key verification failed')) {
    return 'host-key-mismatch';
  }
  if (s.includes('no matching host key') ||
      s.includes('the authenticity of host')) {
    return 'host-key-unknown';
  }
  if (s.includes('permission denied')) return 'auth-failed';
  if (s.includes('connection refused') ||
      s.includes('no route to host') ||
      s.includes('network is unreachable') ||
      s.includes('name or service not known') ||
      s.includes('could not resolve hostname')) {
    return 'unreachable';
  }
  if (s.includes('operation timed out') || s.includes('connection timed out')) {
    return 'timeout';
  }
  return 'command-failed';
}

/**
 * Try a no-op ssh command to verify we can auth and open a channel.
 * Resolves with the stderr on success (rare, but ssh occasionally warns on
 * stderr while returning 0), or throws SshError on failure.
 */
export async function test(target: SshTarget, opts: { timeoutMs?: number } = {}): Promise<{ stderr: string }> {
  validateTarget(target);
  const args = [
    ...baseOptions(target),
    '-p', String(target.port),
    `${target.user}@${target.host}`,
    'true',
  ];
  try {
    const r = await _runner('ssh', args, { timeout: opts.timeoutMs ?? 15_000, encoding: 'utf8' } as ExecFileOptions & { encoding: 'utf8' });
    return { stderr: String(r.stderr) };
  } catch (err) {
    throw toSshError(err, 'ssh test failed');
  }
}

/**
 * Run a single command on the remote host. The `remoteCommand` string is
 * passed to ssh AS a single argv element — ssh joins it into a shell string on
 * the remote side. If you need argument interpolation, build the string
 * yourself with proper shell quoting; this function does no unquoting.
 */
export async function run(
  target: SshTarget,
  remoteCommand: string,
  opts: { timeoutMs?: number; input?: string } = {},
): Promise<RunResult> {
  validateTarget(target);
  const args = [
    ...baseOptions(target),
    '-p', String(target.port),
    `${target.user}@${target.host}`,
    remoteCommand,
  ];
  const execOpts: ExecFileOptions & { input?: string; encoding: 'utf8' } = {
    timeout: opts.timeoutMs ?? 30_000,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
  };
  if (opts.input !== undefined) execOpts.input = opts.input;
  try {
    const r = await _runner('ssh', args, execOpts);
    return { stdout: String(r.stdout), stderr: String(r.stderr), code: 0 };
  } catch (err) {
    // execFile throws on non-zero exit; construct a typed error but preserve stdout/stderr
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    if (typeof e.code === 'number' && e.code !== 0) {
      throw new SshError(classifyStderr(String(e.stderr ?? '')), `ssh command failed (exit ${e.code})`, {
        stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? ''),
        exitCode: e.code,
      });
    }
    throw toSshError(err, 'ssh run failed');
  }
}

/**
 * Upload a local file to a remote path via scp.
 */
export async function upload(
  target: SshTarget,
  localPath: string,
  remotePath: string,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  validateTarget(target);
  if (!/^[\w./\-]+$/.test(localPath)) {
    throw new SshError('invalid-input', `invalid localPath: ${JSON.stringify(localPath)}`);
  }
  if (!/^[\w./~\-]+$/.test(remotePath)) {
    throw new SshError('invalid-input', `invalid remotePath: ${JSON.stringify(remotePath)}`);
  }
  // scp's `user@host:path` needs the host bracketed for IPv6 (colons in the
  // address would otherwise conflict with the `:path` separator). ssh's plain
  // `user@host` form doesn't require it, but we bracket for consistency —
  // ssh accepts either.
  const scpHost = target.host.includes(':') && !target.host.startsWith('[')
    ? `[${target.host}]`
    : target.host;
  const args = [
    ...baseOptions(target),
    '-P', String(target.port),
    localPath,
    `${target.user}@${scpHost}:${remotePath}`,
  ];
  try {
    await _runner('scp', args, { timeout: opts.timeoutMs ?? 120_000 } as ExecFileOptions);
  } catch (err) {
    throw toSshError(err, 'scp upload failed');
  }
}

function toSshError(err: unknown, prefix: string): SshError {
  const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; signal?: string };
  const stderr = String(e.stderr ?? '');
  const stdout = String(e.stdout ?? '');
  if ((e as { code?: string }).code === 'ENOENT') {
    return new SshError('ssh-missing', `${prefix}: ssh/scp binary not found in PATH`, { stderr, stdout });
  }
  if (e.killed || e.signal === 'SIGTERM') {
    return new SshError('timeout', `${prefix}: timed out`, { stderr, stdout });
  }
  return new SshError(classifyStderr(stderr), `${prefix}: ${e.message ?? 'unknown error'}`, {
    stderr,
    stdout,
    exitCode: typeof e.code === 'number' ? e.code : null,
  });
}
