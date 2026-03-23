import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store registered handlers
const handlers = new Map<string, Function>();
const listeners = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: Function) => {
      listeners.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

// Mock SessionManager
const mockSpawn = vi.fn().mockReturnValue({ id: 'test-id', name: 'test', cwd: '/tmp', command: '/bin/bash', pid: 123, status: 'working' });
const mockResize = vi.fn();
const mockClose = vi.fn();
const mockGetAll = vi.fn().mockReturnValue([]);
const mockWrite = vi.fn();
const mockSetOnData = vi.fn();
const mockSetOnExit = vi.fn();

const mockSessionManager = {
  spawn: mockSpawn,
  resize: mockResize,
  close: mockClose,
  getAll: mockGetAll,
  write: mockWrite,
  setOnData: mockSetOnData,
  setOnExit: mockSetOnExit,
};

import { registerIpcHandlers } from '../../src/main/ipc-handlers';

describe('IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    listeners.clear();
    registerIpcHandlers(mockSessionManager as any);
  });

  describe('pty:spawn', () => {
    it('registers a handler', () => {
      expect(handlers.has('pty:spawn')).toBe(true);
    });

    it('validates name is required', () => {
      const handler = handlers.get('pty:spawn')!;
      expect(() => handler({}, { name: '', cwd: '/tmp' })).toThrow('non-empty name');
    });

    it('validates cwd is required', () => {
      const handler = handlers.get('pty:spawn')!;
      expect(() => handler({}, { name: 'test', cwd: '' })).toThrow('non-empty cwd');
    });

    it('delegates to session manager', () => {
      const handler = handlers.get('pty:spawn')!;
      const result = handler({}, { name: 'test', cwd: '/tmp' });

      expect(mockSpawn).toHaveBeenCalledWith({ name: 'test', cwd: '/tmp', command: undefined });
      expect(result.id).toBe('test-id');
    });
  });

  describe('pty:resize', () => {
    it('validates sessionId is required', () => {
      const handler = handlers.get('pty:resize')!;
      expect(() => handler({}, { cols: 80, rows: 24 })).toThrow('sessionId');
    });

    it('validates cols and rows are numbers', () => {
      const handler = handlers.get('pty:resize')!;
      expect(() => handler({}, { sessionId: 'id', cols: 'x', rows: 24 })).toThrow('numeric');
    });

    it('delegates to session manager', () => {
      const handler = handlers.get('pty:resize')!;
      handler({}, { sessionId: 'test-id', cols: 120, rows: 40 });

      expect(mockResize).toHaveBeenCalledWith('test-id', 120, 40);
    });
  });

  describe('pty:close', () => {
    it('validates sessionId', () => {
      const handler = handlers.get('pty:close')!;
      expect(() => handler({}, {})).toThrow('sessionId');
    });

    it('delegates to session manager', () => {
      const handler = handlers.get('pty:close')!;
      handler({}, { sessionId: 'test-id' });

      expect(mockClose).toHaveBeenCalledWith('test-id');
    });
  });

  describe('session:list', () => {
    it('delegates to session manager', () => {
      const handler = handlers.get('session:list')!;
      handler({});

      expect(mockGetAll).toHaveBeenCalled();
    });
  });

  describe('pty:input', () => {
    it('registers a listener', () => {
      expect(listeners.has('pty:input')).toBe(true);
    });

    it('delegates to session manager write', () => {
      const listener = listeners.get('pty:input')!;
      listener({}, { sessionId: 'test-id', data: 'hello' });

      expect(mockWrite).toHaveBeenCalledWith('test-id', 'hello');
    });

    it('silently drops invalid input', () => {
      const listener = listeners.get('pty:input')!;
      listener({}, { sessionId: 123, data: 'hello' });
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  describe('event wiring', () => {
    it('sets up onData handler', () => {
      expect(mockSetOnData).toHaveBeenCalledOnce();
    });

    it('sets up onExit handler', () => {
      expect(mockSetOnExit).toHaveBeenCalledOnce();
    });
  });
});
