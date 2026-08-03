import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Runtime config for the daemon.
 *
 * Auth is mutual TLS (mTLS) keyed off the operator's lab CA. Certs are
 * operator-provisioned out-of-band to a well-known directory. Pairing codes,
 * bearer tokens, and cert fingerprint pins were retired in DEC-000010; there
 * is no legacy or dev-mode fallback. If any of the cert files is missing or
 * malformed, `loadConfig` throws before the daemon binds a port.
 *
 * See `specs/src/daemon/transport-mtls-spec.md`.
 */
export interface DaemonConfig {
  port: number;
  host: string;
  tls: {
    /** Directory the three cert files were loaded from (for logging/diagnostics). */
    dir: string;
    /** Server certificate PEM (leaf, signed by the lab CA). */
    cert: string;
    /** Server private key PEM (matches `cert`). */
    key: string;
    /** Lab CA root cert PEM (trust anchor for client-cert validation). */
    ca: string;
  };
  scrollbackLimit: number;
  sessionPersistPath: string;
  idlePattern?: string;
  /**
   * SAN FQDNs of client identities allowed to invoke `inject:request`.
   * Empty list = no client is authorized. Populated by the operator per
   * `specs/src/daemon/inject-api-spec.md`.
   */
  injectAllowedClients: string[];
}

const DEFAULTS = {
  port: 3717,
  host: '127.0.0.1',
  scrollbackLimit: 50000,
  injectAllowedClients: [] as string[],
};

function getDataDir(): string {
  return process.env.SWITCHBOARD_HOME || path.join(os.homedir(), '.switchboard');
}

/**
 * Resolve the cert directory, in precedence order:
 * 1. `SWITCHBOARD_TLS_DIR` environment variable.
 * 2. `tls.dir` in the parsed config file (if present).
 * 3. `<data-dir>/tls/` (the well-known default).
 */
function resolveTlsDir(configFileTlsDir: string | undefined, dataDir: string): string {
  if (process.env.SWITCHBOARD_TLS_DIR) return process.env.SWITCHBOARD_TLS_DIR;
  if (configFileTlsDir) return configFileTlsDir;
  return path.join(dataDir, 'tls');
}

class CertLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertLoadError';
  }
}

/**
 * Read the three required PEM files. Refuses to return a partial bundle;
 * a missing/unreadable/malformed file becomes a CertLoadError naming the
 * exact path and the reason. Never generates certs on the daemon's behalf.
 */
function loadCertBundle(tlsDir: string): { cert: string; key: string; ca: string } {
  const certPath = path.join(tlsDir, 'server.crt');
  const keyPath = path.join(tlsDir, 'server.key');
  const caPath = path.join(tlsDir, 'ca.crt');

  const attempts: string[] = [tlsDir, certPath, keyPath, caPath];
  const readOrThrow = (p: string): string => {
    try {
      const body = fs.readFileSync(p, 'utf-8');
      if (!body.includes('-----BEGIN')) {
        throw new CertLoadError(`${p} exists but is not a PEM file`);
      }
      return body;
    } catch (err) {
      if (err instanceof CertLoadError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new CertLoadError(
          `required TLS file not found: ${p}\n` +
            `The daemon needs a lab-CA-signed server cert + key + the CA root cert at these paths.\n` +
            `Tried: ${attempts.join(', ')}\n` +
            `See specs/src/daemon/transport-mtls-spec.md for the expected layout.`
        );
      }
      throw new CertLoadError(`failed to read ${p}: ${(err as Error).message}`);
    }
  };

  return {
    cert: readOrThrow(certPath),
    key: readOrThrow(keyPath),
    ca: readOrThrow(caPath),
  };
}

/**
 * Runtime overrides that always win over both saved config and defaults.
 * `SWITCHBOARD_HOST` lets remote-provisioned daemons bind to `::` without
 * a config-file edit — the systemd unit our client writes sets it explicitly.
 */
function envOverrides(): Partial<DaemonConfig> {
  const out: Partial<DaemonConfig> = {};
  if (process.env.SWITCHBOARD_HOST) out.host = process.env.SWITCHBOARD_HOST;
  if (process.env.SWITCHBOARD_PORT) {
    const p = parseInt(process.env.SWITCHBOARD_PORT, 10);
    if (Number.isFinite(p)) out.port = p;
  }
  return out;
}

export function loadConfig(configPath?: string): DaemonConfig {
  const dataDir = getDataDir();
  const cfgPath = configPath || path.join(dataDir, 'daemon.json');

  // Read the config file if it exists — we still support a config file, but
  // it no longer contains cert paths or tokens; only per-daemon knobs (port,
  // host, injectAllowedClients, etc.).
  let parsed: Partial<DaemonConfig> & { tls?: { dir?: string } } = {};
  if (fs.existsSync(cfgPath)) {
    parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  }

  const tlsDir = resolveTlsDir(parsed.tls?.dir, dataDir);
  const bundle = loadCertBundle(tlsDir);

  const merged: DaemonConfig = {
    port: parsed.port ?? DEFAULTS.port,
    host: parsed.host ?? DEFAULTS.host,
    scrollbackLimit: parsed.scrollbackLimit ?? DEFAULTS.scrollbackLimit,
    sessionPersistPath: parsed.sessionPersistPath ?? path.join(dataDir, 'sessions.json'),
    idlePattern: parsed.idlePattern,
    injectAllowedClients: parsed.injectAllowedClients ?? DEFAULTS.injectAllowedClients,
    tls: {
      dir: tlsDir,
      cert: bundle.cert,
      key: bundle.key,
      ca: bundle.ca,
    },
    ...envOverrides(),
  };

  // Ensure supporting dirs exist for session persistence / output buffers.
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'buffers'), { recursive: true });

  return merged;
}
