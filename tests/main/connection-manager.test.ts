import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DaemonConnectionConfig } from '../../src/shared/types';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('ws', () => ({
  WebSocket: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 0,
  })),
}));

import { ConnectionManager } from '../../src/main/connection-manager';
import { LOCALHOST_DAEMON_ID } from '../../src/main/local-daemon';

function makeConfig(id: string, overrides: Partial<DaemonConnectionConfig> = {}): DaemonConnectionConfig {
  return {
    id,
    name: `Daemon ${id}`,
    host: '10.0.0.1',
    port: 3717,
    token: 'test-token',
    fingerprint: 'test-fp',
    autoConnect: true,
    ...overrides,
  };
}

describe('ConnectionManager persistence', () => {
  let mockPrefs: any;
  let mockStore: any;
  let cm: ConnectionManager;

  beforeEach(() => {
    mockPrefs = { daemonConnections: [] };
    mockStore = {
      load: vi.fn(() => mockPrefs),
      save: vi.fn((p: any) => {
        mockPrefs = p;
      }),
      reset: vi.fn(),
    };
    cm = new ConnectionManager(mockStore);
  });

  it('persists remote daemons when removeConnection is called', () => {
    cm.addConnection(makeConfig('vm-a'));
    cm.addConnection(makeConfig('vm-b'));
    expect(mockStore.save).not.toHaveBeenCalled(); // addConnection alone doesn't persist

    cm.removeConnection('vm-a');

    expect(mockStore.save).toHaveBeenCalledTimes(1);
    const saved = mockStore.save.mock.calls[0][0];
    expect(saved.daemonConnections).toHaveLength(1);
    expect(saved.daemonConnections[0].id).toBe('vm-b');
  });

  it('never persists the localhost daemon', () => {
    cm.addConnection(makeConfig(LOCALHOST_DAEMON_ID));
    cm.addConnection(makeConfig('vm-a'));

    cm.removeConnection('vm-a');

    const saved = mockStore.save.mock.calls[0][0];
    expect(saved.daemonConnections).toHaveLength(0);
  });

  it('does not throw when no PreferencesStore is provided', () => {
    const bare = new ConnectionManager();
    bare.addConnection(makeConfig('vm-a'));
    expect(() => bare.removeConnection('vm-a')).not.toThrow();
  });

  it('writes an empty array when the last remote daemon is removed', () => {
    cm.addConnection(makeConfig('vm-a'));
    cm.removeConnection('vm-a');

    const saved = mockStore.save.mock.calls[0][0];
    expect(saved.daemonConnections).toEqual([]);
  });
});
