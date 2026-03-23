import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
  },
}));

import { SessionStore } from '../../src/main/session-store';

describe('SessionStore', () => {
  let storePath: string;
  let store: SessionStore;

  beforeEach(() => {
    storePath = path.join(os.tmpdir(), `switchboard-test-${Date.now()}.json`);
    store = new SessionStore(storePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(storePath); } catch { /* */ }
  });

  it('load returns empty array when file does not exist', () => {
    expect(store.load()).toEqual([]);
  });

  it('save and load round-trip preserves data', () => {
    const sessions = [
      { name: 'project-a', cwd: '/tmp/a', command: 'claude' },
      { name: 'project-b', cwd: '/tmp/b', command: '/bin/bash' },
    ];
    store.save(sessions);
    expect(store.load()).toEqual(sessions);
  });

  it('load returns empty array for corrupt JSON', () => {
    fs.writeFileSync(storePath, 'not valid json!!!', 'utf-8');
    expect(store.load()).toEqual([]);
  });

  it('load returns empty array for missing sessions key', () => {
    fs.writeFileSync(storePath, JSON.stringify({ other: 'data' }), 'utf-8');
    expect(store.load()).toEqual([]);
  });

  it('load filters out invalid session entries', () => {
    const data = {
      sessions: [
        { name: 'valid', cwd: '/tmp', command: 'claude' },
        { name: 123, cwd: '/tmp', command: 'claude' },  // Invalid
        { name: 'missing-cwd' },  // Invalid
      ],
    };
    fs.writeFileSync(storePath, JSON.stringify(data), 'utf-8');
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('valid');
  });

  it('save overwrites existing file', () => {
    store.save([{ name: 'first', cwd: '/tmp', command: 'bash' }]);
    store.save([{ name: 'second', cwd: '/tmp', command: 'bash' }]);
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('second');
  });
});
