import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

export interface DaemonConfig {
  port: number;
  host: string;
  tls: {
    cert: string;
    key: string;
    ca?: string;
  };
  auth: {
    token: string;
  };
  scrollbackLimit: number;
  sessionPersistPath: string;
  idlePattern?: string;
}

const DEFAULTS: Omit<DaemonConfig, 'tls' | 'auth' | 'sessionPersistPath'> = {
  port: 3717,
  host: '127.0.0.1',
  scrollbackLimit: 50000,
};

function getDataDir(): string {
  return process.env.SWITCHBOARD_HOME || path.join(require('os').homedir(), '.switchboard');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateSelfSignedCert(dataDir: string): { certPath: string; keyPath: string } {
  const certPath = path.join(dataDir, 'daemon.crt');
  const keyPath = path.join(dataDir, 'daemon.key');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Write private key
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  fs.writeFileSync(keyPath, keyPem, { mode: 0o600 });

  // Generate self-signed certificate using openssl (available on all target platforms)
  // We write the key first, then use openssl to create the cert
  try {
    execSync(
      `openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 3650 -subj "/CN=switchboard-daemon" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Fallback: write a placeholder — the user will need to provide their own cert
    // This handles environments where openssl is not available
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    fs.writeFileSync(certPath, pubPem, { mode: 0o644 });
  }

  return { certPath, keyPath };
}

export function getCertFingerprint(certPath: string): string {
  const certPem = fs.readFileSync(certPath, 'utf-8');
  const hash = crypto.createHash('sha256').update(certPem).digest('hex');
  return hash;
}

export function loadConfig(configPath?: string): DaemonConfig {
  const dataDir = getDataDir();
  const cfgPath = configPath || path.join(dataDir, 'daemon.json');

  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      sessionPersistPath: path.join(dataDir, 'sessions.json'),
      ...parsed,
    };
  }

  // First-run setup
  return initConfig(dataDir, cfgPath);
}

export function initConfig(dataDir: string, cfgPath: string): DaemonConfig {
  // Ensure data directory exists
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'buffers'), { recursive: true });

  // Generate TLS cert and key
  const { certPath, keyPath } = generateSelfSignedCert(dataDir);

  // Generate auth token
  const token = generateToken();

  const config: DaemonConfig = {
    ...DEFAULTS,
    tls: {
      cert: certPath,
      key: keyPath,
    },
    auth: {
      token,
    },
    scrollbackLimit: DEFAULTS.scrollbackLimit,
    sessionPersistPath: path.join(dataDir, 'sessions.json'),
  };

  // Write config file
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), { mode: 0o600 });

  // Print connection string
  const fingerprint = getCertFingerprint(certPath);
  const connStr = `switchboard://${config.host}:${config.port}?token=${token}&fingerprint=${fingerprint}`;
  console.log('Switchboard daemon initialized.');
  console.log(`Connection string: ${connStr}`);

  return config;
}
