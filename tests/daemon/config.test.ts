import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, initConfig } from '../../src/daemon/config';

describe('DaemonConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-cfg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads config from existing file', () => {
    const cfgPath = path.join(tmpDir, 'daemon.json');
    const config = {
      port: 4000,
      host: '0.0.0.0',
      tls: { cert: '/path/to/cert', key: '/path/to/key' },
      auth: { token: 'test-token' },
      scrollbackLimit: 10000,
    };
    fs.writeFileSync(cfgPath, JSON.stringify(config));

    const loaded = loadConfig(cfgPath);
    expect(loaded.port).toBe(4000);
    expect(loaded.host).toBe('0.0.0.0');
    expect(loaded.auth.token).toBe('test-token');
    expect(loaded.scrollbackLimit).toBe(10000);
  });

  it('applies defaults for missing optional fields', () => {
    const cfgPath = path.join(tmpDir, 'daemon.json');
    const config = {
      tls: { cert: '/path/to/cert', key: '/path/to/key' },
      auth: { token: 'test-token' },
    };
    fs.writeFileSync(cfgPath, JSON.stringify(config));

    const loaded = loadConfig(cfgPath);
    expect(loaded.port).toBe(3717);
    expect(loaded.host).toBe('127.0.0.1');
    expect(loaded.scrollbackLimit).toBe(50000);
  });

  it('initConfig creates data directory and config file', () => {
    const dataDir = path.join(tmpDir, 'switchboard');
    const cfgPath = path.join(dataDir, 'daemon.json');

    const config = initConfig(dataDir, cfgPath);

    expect(fs.existsSync(cfgPath)).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'buffers'))).toBe(true);
    expect(config.port).toBe(3717);
    expect(config.auth.token).toHaveLength(64); // 32 bytes hex = 64 chars
    expect(config.tls.cert).toContain(dataDir);
    expect(config.tls.key).toContain(dataDir);
  });

  it('initConfig generates a unique token each time', () => {
    const dir1 = path.join(tmpDir, 'a');
    const dir2 = path.join(tmpDir, 'b');
    const cfg1 = initConfig(dir1, path.join(dir1, 'daemon.json'));
    const cfg2 = initConfig(dir2, path.join(dir2, 'daemon.json'));
    expect(cfg1.auth.token).not.toBe(cfg2.auth.token);
  });

  it('initConfig creates TLS key file', () => {
    const dataDir = path.join(tmpDir, 'switchboard');
    const cfgPath = path.join(dataDir, 'daemon.json');
    const config = initConfig(dataDir, cfgPath);
    expect(fs.existsSync(config.tls.key)).toBe(true);
  });
});
