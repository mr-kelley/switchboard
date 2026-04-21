import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

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
  app: {
    getPath: vi.fn().mockReturnValue(path.join(os.tmpdir(), 'switchboard-test-ipc')),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

import { registerIpcHandlers } from '../../src/main/ipc-handlers';

describe('IPC Handlers', () => {
  let mockConnectionManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    listeners.clear();
    mockConnectionManager = {
      hasDaemons: vi.fn().mockReturnValue(true),
      getDefaultDaemonId: vi.fn().mockReturnValue('localhost'),
      getAllSessions: vi.fn().mockReturnValue([]),
      connectAll: vi.fn(),
      disconnectAll: vi.fn(),
      addConnection: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      removeConnection: vi.fn(),
      getConnectionStatuses: vi.fn().mockReturnValue([]),
      spawn: vi.fn(),
      input: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
      rename: vi.fn(),
      pair: vi.fn(),
      submitPairingCode: vi.fn(),
    };
    registerIpcHandlers(mockConnectionManager);
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

    it('routes to default daemon when daemonId not provided', () => {
      const handler = handlers.get('pty:spawn')!;
      handler({}, { name: 'test', cwd: '/tmp' });
      expect(mockConnectionManager.spawn).toHaveBeenCalledWith('localhost', 'test', '/tmp', undefined);
    });

    it('routes to explicit daemonId when provided', () => {
      const handler = handlers.get('pty:spawn')!;
      handler({}, { name: 'test', cwd: '/tmp', daemonId: 'vm-box' });
      expect(mockConnectionManager.spawn).toHaveBeenCalledWith('vm-box', 'test', '/tmp', undefined);
    });

    it('throws when no daemon is available', () => {
      mockConnectionManager.getDefaultDaemonId.mockReturnValue(null);
      const handler = handlers.get('pty:spawn')!;
      expect(() => handler({}, { name: 'test', cwd: '/tmp' })).toThrow('No daemon connected');
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

    it('delegates to connection manager', () => {
      const handler = handlers.get('pty:resize')!;
      handler({}, { sessionId: 'localhost:abc', cols: 120, rows: 40 });
      expect(mockConnectionManager.resize).toHaveBeenCalledWith('localhost:abc', 120, 40);
    });
  });

  describe('pty:close', () => {
    it('validates sessionId', () => {
      const handler = handlers.get('pty:close')!;
      expect(() => handler({}, {})).toThrow('sessionId');
    });

    it('delegates to connection manager', () => {
      const handler = handlers.get('pty:close')!;
      handler({}, { sessionId: 'localhost:abc' });
      expect(mockConnectionManager.close).toHaveBeenCalledWith('localhost:abc');
    });
  });

  describe('session:list', () => {
    it('delegates to connection manager', () => {
      const handler = handlers.get('session:list')!;
      handler({});
      expect(mockConnectionManager.getAllSessions).toHaveBeenCalled();
    });
  });

  describe('session:rename', () => {
    it('validates sessionId and name', () => {
      const handler = handlers.get('session:rename')!;
      expect(() => handler({}, { sessionId: 'id', name: '' })).toThrow('non-empty name');
    });

    it('delegates to connection manager', () => {
      const handler = handlers.get('session:rename')!;
      handler({}, { sessionId: 'localhost:abc', name: 'new-name' });
      expect(mockConnectionManager.rename).toHaveBeenCalledWith('localhost:abc', 'new-name');
    });
  });

  describe('pty:input', () => {
    it('registers a listener', () => {
      expect(listeners.has('pty:input')).toBe(true);
    });

    it('delegates to connection manager', () => {
      const listener = listeners.get('pty:input')!;
      listener({}, { sessionId: 'localhost:abc', data: 'hello' });
      expect(mockConnectionManager.input).toHaveBeenCalledWith('localhost:abc', 'hello');
    });

    it('silently drops invalid input', () => {
      const listener = listeners.get('pty:input')!;
      listener({}, { sessionId: 123, data: 'hello' });
      expect(mockConnectionManager.input).not.toHaveBeenCalled();
    });
  });

  describe('daemon management', () => {
    it('registers daemon:add, daemon:connect, daemon:disconnect, daemon:remove', () => {
      expect(handlers.has('daemon:add')).toBe(true);
      expect(handlers.has('daemon:connect')).toBe(true);
      expect(handlers.has('daemon:disconnect')).toBe(true);
      expect(handlers.has('daemon:remove')).toBe(true);
    });

    it('registers pairing handlers', () => {
      expect(handlers.has('daemon:pair')).toBe(true);
      expect(handlers.has('daemon:submit-code')).toBe(true);
    });
  });
});
