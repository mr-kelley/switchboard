import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-pty
const mockWrite = vi.fn();
const mockResize = vi.fn();
const mockKill = vi.fn();
const mockOnData = vi.fn();
const mockOnExit = vi.fn();

vi.mock('node-pty', () => ({
  spawn: vi.fn().mockImplementation(() => ({
    pid: 12345,
    write: mockWrite,
    resize: mockResize,
    kill: mockKill,
    onData: mockOnData,
    onExit: mockOnExit,
  })),
}));

import { SessionManager } from '../../src/main/session-manager';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager();
  });

  describe('spawn', () => {
    it('creates a session and returns its info', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });

      expect(session.id).toBeDefined();
      expect(session.name).toBe('test');
      expect(session.cwd).toBe('/tmp');
      expect(session.pid).toBe(12345);
      expect(session.status).toBe('working');
    });

    it('stores the session in the active sessions', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });
      const all = manager.getAll();

      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(session.id);
    });

    it('registers data and exit listeners on the PTY', () => {
      manager.spawn({ name: 'test', cwd: '/tmp' });

      expect(mockOnData).toHaveBeenCalledOnce();
      expect(mockOnExit).toHaveBeenCalledOnce();
    });

    it('uses custom command when provided', async () => {
      const pty = await import('node-pty');
      manager.spawn({ name: 'test', cwd: '/tmp', command: 'claude' });

      expect(vi.mocked(pty.spawn)).toHaveBeenCalledWith('claude', [], expect.objectContaining({
        cwd: '/tmp',
      }));
    });
  });

  describe('write', () => {
    it('sends data to the correct PTY', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });
      manager.write(session.id, 'hello\n');

      expect(mockWrite).toHaveBeenCalledWith('hello\n');
    });

    it('throws for unknown session ID', () => {
      expect(() => manager.write('nonexistent', 'data')).toThrow('Session not found');
    });
  });

  describe('resize', () => {
    it('resizes the correct PTY', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });
      manager.resize(session.id, 120, 40);

      expect(mockResize).toHaveBeenCalledWith(120, 40);
    });

    it('throws for invalid dimensions', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });

      expect(() => manager.resize(session.id, 0, 40)).toThrow('Invalid dimensions');
      expect(() => manager.resize(session.id, 120, -1)).toThrow('Invalid dimensions');
      expect(() => manager.resize(session.id, 1.5, 40)).toThrow('Invalid dimensions');
    });

    it('throws for unknown session ID', () => {
      expect(() => manager.resize('nonexistent', 80, 24)).toThrow('Session not found');
    });
  });

  describe('close', () => {
    it('kills the PTY and removes the session', () => {
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });
      manager.close(session.id);

      expect(mockKill).toHaveBeenCalledOnce();
      expect(manager.getAll()).toHaveLength(0);
    });

    it('throws for unknown session ID', () => {
      expect(() => manager.close('nonexistent')).toThrow('Session not found');
    });
  });

  describe('getAll', () => {
    it('returns all active sessions', () => {
      manager.spawn({ name: 'project-a', cwd: '/tmp/a' });
      manager.spawn({ name: 'project-b', cwd: '/tmp/b' });

      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.name).sort()).toEqual(['project-a', 'project-b']);
    });

    it('returns empty array when no sessions exist', () => {
      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe('isolation', () => {
    it('closing one session does not affect others', () => {
      const s1 = manager.spawn({ name: 'a', cwd: '/tmp' });
      const s2 = manager.spawn({ name: 'b', cwd: '/tmp' });

      manager.close(s1.id);

      expect(manager.getAll()).toHaveLength(1);
      expect(manager.getAll()[0].id).toBe(s2.id);
    });
  });

  describe('closeAll', () => {
    it('closes all active sessions', () => {
      manager.spawn({ name: 'a', cwd: '/tmp' });
      manager.spawn({ name: 'b', cwd: '/tmp' });

      manager.closeAll();

      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe('data callback', () => {
    it('fires onData callback when PTY emits data', () => {
      const dataHandler = vi.fn();
      manager.setOnData(dataHandler);
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });

      // Simulate PTY data emission
      const ptyDataCallback = mockOnData.mock.calls[0][0];
      ptyDataCallback('output text');

      expect(dataHandler).toHaveBeenCalledWith(session.id, 'output text');
    });
  });

  describe('exit callback', () => {
    it('fires onExit callback and removes session when PTY exits', () => {
      const exitHandler = vi.fn();
      manager.setOnExit(exitHandler);
      const session = manager.spawn({ name: 'test', cwd: '/tmp' });

      // Simulate PTY exit
      const ptyExitCallback = mockOnExit.mock.calls[0][0];
      ptyExitCallback({ exitCode: 0 });

      expect(exitHandler).toHaveBeenCalledWith(session.id, 0);
      expect(manager.getAll()).toHaveLength(0);
    });
  });
});
