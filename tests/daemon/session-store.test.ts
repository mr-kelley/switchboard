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
      { id: 'sid-1', name: 'test', cwd: '/tmp', command: '/bin/bash' },
    ];
    store.save(sessions);
    expect(store.load()).toEqual(sessions);
  });

  it('filters invalid session entries', () => {
    fs.writeFileSync(storePath, JSON.stringify({
      sessions: [
        { id: 'sid-1', name: 'valid', cwd: '/tmp', command: '/bin/bash' },
        { id: 'sid-2', name: 123, cwd: '/tmp', command: '/bin/bash' }, // invalid name
        { id: 'sid-3', name: 'no-cwd' }, // missing fields
        { name: 'no-id', cwd: '/tmp', command: '/bin/bash' }, // missing id
      ],
    }));
    const store = new SessionStore(storePath);
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('valid');
    expect(loaded[0].id).toBe('sid-1');
  });

  it('returns empty array for corrupted file', () => {
    fs.writeFileSync(storePath, 'not json');
    const store = new SessionStore(storePath);
    expect(store.load()).toEqual([]);
  });

  it('creates parent directories when saving', () => {
    const deepPath = path.join(tmpDir, 'sub', 'dir', 'sessions.json');
    const store = new SessionStore(deepPath);
    store.save([{ id: 'sid-1', name: 'test', cwd: '/tmp', command: 'bash' }]);
    expect(fs.existsSync(deepPath)).toBe(true);
  });

  it('drops legacy sessions without ids on load', () => {
    fs.writeFileSync(storePath, JSON.stringify({
      sessions: [
        { name: 'legacy', cwd: '/tmp', command: '/bin/bash' },
      ],
    }));
    const store = new SessionStore(storePath);
    expect(store.load()).toEqual([]);
  });
});
