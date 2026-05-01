import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPty } = vi.hoisted(() => {
  const mockPty = {
    pid: 42,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  };
  return { mockPty };
});

vi.mock('node-pty', () => ({
  spawn: vi.fn().mockReturnValue(mockPty),
}));

import { PtyManager } from '../../src/daemon/pty-manager';

describe('PtyManager', () => {
  let manager: PtyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new PtyManager();
  });

  it('spawns a session and returns session info', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    expect(info.id).toBeDefined();
    expect(info.name).toBe('test');
    expect(info.cwd).toBe('/tmp');
    expect(info.pid).toBe(42);
    expect(info.status).toBe('working');
  });

  it('stores spawned sessions in getAll', () => {
    manager.spawn({ name: 'a', cwd: '/tmp' });
    manager.spawn({ name: 'b', cwd: '/tmp' });
    expect(manager.getAll()).toHaveLength(2);
  });

  it('getSession returns a session by ID', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    const found = manager.getSession(info.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('test');
  });

  it('getSession returns undefined for unknown ID', () => {
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('spawns with a caller-supplied id when provided', () => {
    const info = manager.spawn({ id: 'fixed-id', name: 'restored', cwd: '/tmp' });
    expect(info.id).toBe('fixed-id');
    expect(manager.has('fixed-id')).toBe(true);
  });

  it('has returns false for unknown ids', () => {
    expect(manager.has('nope')).toBe(false);
  });

  it('write sends data to the correct PTY', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    manager.write(info.id, 'hello');
    expect(mockPty.write).toHaveBeenCalledWith('hello');
  });

  it('write throws for unknown session', () => {
    expect(() => manager.write('bad', 'data')).toThrow('Session not found');
  });

  it('resize calls pty.resize with correct dimensions', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    manager.resize(info.id, 120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('resize throws for invalid dimensions', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    expect(() => manager.resize(info.id, 0, 40)).toThrow('Invalid dimensions');
    expect(() => manager.resize(info.id, 80, -1)).toThrow('Invalid dimensions');
  });

  it('resize throws for unknown session', () => {
    expect(() => manager.resize('bad', 80, 24)).toThrow('Session not found');
  });

  it('close removes the session', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    manager.close(info.id);
    expect(manager.getAll()).toHaveLength(0);
  });

  it('close throws for unknown session', () => {
    expect(() => manager.close('bad')).toThrow('Session not found');
  });

  it('rename updates the session name', () => {
    const info = manager.spawn({ name: 'old', cwd: '/tmp' });
    manager.rename(info.id, 'new');
    expect(manager.getSession(info.id)!.name).toBe('new');
  });

  it('rename throws for unknown session', () => {
    expect(() => manager.rename('bad', 'name')).toThrow('Session not found');
  });

  it('updateStatus changes session status', () => {
    const info = manager.spawn({ name: 'test', cwd: '/tmp' });
    manager.updateStatus(info.id, 'idle');
    expect(manager.getSession(info.id)!.status).toBe('idle');
  });

  it('closeAll closes all sessions', () => {
    manager.spawn({ name: 'a', cwd: '/tmp' });
    manager.spawn({ name: 'b', cwd: '/tmp' });
    manager.closeAll();
    expect(manager.getAll()).toHaveLength(0);
  });
});
