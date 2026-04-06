import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionStore } from '../../src/daemon/session-store';

describe('SessionStore (daemon)', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-store-'));
    storePath = path.join(tmpDir, 'sessions.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when no file exists', () => {
    const store = new SessionStore(storePath);
    expect(store.load()).toEqual([]);
  });

  it('saves and loads sessions', () => {
    const store = new SessionStore(storePath);
    const sessions = [
      { name: 'test', cwd: '/tmp', command: '/bin/bash' },
    ];
    store.save(sessions);
    expect(store.load()).toEqual(sessions);
  });

  it('filters invalid session entries', () => {
    fs.writeFileSync(storePath, JSON.stringify({
      sessions: [
        { name: 'valid', cwd: '/tmp', command: '/bin/bash' },
        { name: 123, cwd: '/tmp', command: '/bin/bash' }, // invalid name
        { name: 'no-cwd' }, // missing fields
      ],
    }));
    const store = new SessionStore(storePath);
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('valid');
  });

  it('returns empty array for corrupted file', () => {
    fs.writeFileSync(storePath, 'not json');
    const store = new SessionStore(storePath);
    expect(store.load()).toEqual([]);
  });

  it('creates parent directories when saving', () => {
    const deepPath = path.join(tmpDir, 'sub', 'dir', 'sessions.json');
    const store = new SessionStore(deepPath);
    store.save([{ name: 'test', cwd: '/tmp', command: 'bash' }]);
    expect(fs.existsSync(deepPath)).toBe(true);
  });
});
