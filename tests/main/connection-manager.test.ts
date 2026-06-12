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

function seedSession(cm: any, daemonId: string, sessionId: string, status: string): void {
  const conn = cm.connections.get(daemonId);
  conn.sessions.set(sessionId, { id: sessionId, name: sessionId, cwd: '/', command: '', pid: 1, status });
}

describe('ConnectionManager attention summary', () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = new ConnectionManager();
    cm.addConnection(makeConfig('vm-a'));
    cm.addConnection(makeConfig('vm-b'));
  });

  it('totals needs-attention sessions across daemons with a per-daemon breakdown', () => {
    seedSession(cm, 'vm-a', 's1', 'needs-attention');
    seedSession(cm, 'vm-a', 's2', 'idle');
    seedSession(cm, 'vm-b', 's3', 'needs-attention');

    const summary = cm.getAttentionSummary();
    expect(summary.total).toBe(2);
    const a = summary.perDaemon.find((d) => d.id === 'vm-a')!;
    expect(a.sessionCount).toBe(2);
    expect(a.attentionCount).toBe(1);
    const b = summary.perDaemon.find((d) => d.id === 'vm-b')!;
    expect(b.attentionCount).toBe(1);
  });

  it('reports zero when there are no needs-attention sessions', () => {
    seedSession(cm, 'vm-a', 's1', 'working');
    expect(cm.getAttentionSummary().total).toBe(0);
  });

  it('onAttentionChange fires listeners and unsubscribe stops them', () => {
    const listener = vi.fn();
    const unsub = cm.onAttentionChange(listener);
    (cm as any).notifyAttentionListeners();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    (cm as any).notifyAttentionListeners();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not break notification of others', () => {
    const good = vi.fn();
    cm.onAttentionChange(() => { throw new Error('boom'); });
    cm.onAttentionChange(good);
    expect(() => (cm as any).notifyAttentionListeners()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectionManager priority resolution', () => {
  it('returns the stored priority and defaults to normal', () => {
    const store: any = {
      load: vi.fn(() => ({ notificationPriorities: { 'vm-a:s1': 'silent' } })),
      save: vi.fn(),
      reset: vi.fn(),
    };
    const cm = new ConnectionManager(store);
    expect((cm as any).resolvePriority('vm-a:s1')).toBe('silent');
    expect((cm as any).resolvePriority('vm-a:unknown')).toBe('normal');
  });

  it('defaults to normal when no store is provided', () => {
    const cm = new ConnectionManager();
    expect((cm as any).resolvePriority('vm-a:s1')).toBe('normal');
  });
});
