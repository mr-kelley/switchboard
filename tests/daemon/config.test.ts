import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../../src/daemon/config';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'tls');

function seedTlsDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, 'server.crt'), path.join(dir, 'server.crt'));
  fs.copyFileSync(path.join(FIXTURES, 'server.key'), path.join(dir, 'server.key'));
  fs.copyFileSync(path.join(FIXTURES, 'ca.crt'), path.join(dir, 'ca.crt'));
}

describe('DaemonConfig (mTLS)', () => {
  let tmpDir: string;
  const savedHome = process.env.SWITCHBOARD_HOME;
  const savedTlsDir = process.env.SWITCHBOARD_TLS_DIR;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-cfg-'));
    process.env.SWITCHBOARD_HOME = tmpDir;
    delete process.env.SWITCHBOARD_TLS_DIR;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.SWITCHBOARD_HOME;
    else process.env.SWITCHBOARD_HOME = savedHome;
    if (savedTlsDir === undefined) delete process.env.SWITCHBOARD_TLS_DIR;
    else process.env.SWITCHBOARD_TLS_DIR = savedTlsDir;
  });

  it('loads certs from the well-known path when no config file exists', () => {
    seedTlsDir(path.join(tmpDir, 'tls'));
    const cfg = loadConfig();
    expect(cfg.port).toBe(3717);
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.tls.cert).toContain('BEGIN CERTIFICATE');
    expect(cfg.tls.key).toContain('BEGIN');
    expect(cfg.tls.ca).toContain('BEGIN CERTIFICATE');
    expect(cfg.injectAllowedClients).toEqual([]);
  });

  it('honors SWITCHBOARD_TLS_DIR env var over the default path', () => {
    const altDir = path.join(tmpDir, 'alt-tls');
    seedTlsDir(altDir);
    process.env.SWITCHBOARD_TLS_DIR = altDir;
    const cfg = loadConfig();
    expect(cfg.tls.dir).toBe(altDir);
  });

  it('reads scalar overrides from the config file (port, host, injectAllowedClients)', () => {
    seedTlsDir(path.join(tmpDir, 'tls'));
    const cfgPath = path.join(tmpDir, 'daemon.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      port: 4000,
      host: '0.0.0.0',
      injectAllowedClients: ['mate.example.internal', 'bosun.example.internal'],
    }));
    const cfg = loadConfig(cfgPath);
    expect(cfg.port).toBe(4000);
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.injectAllowedClients).toEqual(['mate.example.internal', 'bosun.example.internal']);
  });

  it('SWITCHBOARD_HOST env wins over both file and default', () => {
    seedTlsDir(path.join(tmpDir, 'tls'));
    process.env.SWITCHBOARD_HOST = '::';
    try {
      const cfg = loadConfig();
      expect(cfg.host).toBe('::');
    } finally {
      delete process.env.SWITCHBOARD_HOST;
    }
  });

  it('throws a clear CertLoadError when server.crt is missing', () => {
    // Leave the tls dir empty on purpose.
    fs.mkdirSync(path.join(tmpDir, 'tls'), { recursive: true });
    expect(() => loadConfig()).toThrow(/required TLS file not found.*server\.crt/);
  });

  it('throws when a cert file exists but is not PEM', () => {
    const tls = path.join(tmpDir, 'tls');
    seedTlsDir(tls);
    fs.writeFileSync(path.join(tls, 'server.crt'), 'not a pem');
    expect(() => loadConfig()).toThrow(/not a PEM file/);
  });
});
