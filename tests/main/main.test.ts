import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();

let allConstructorCalls: Array<Record<string, unknown>> = [];

vi.mock('electron', () => {
  const BrowserWindowConstructor = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    allConstructorCalls.push(opts);
    return {
      loadURL: mockLoadURL,
      loadFile: mockLoadFile,
      webContents: {
        on: vi.fn(),
        send: vi.fn(),
      },
    };
  });

  return {
    app: {
      isPackaged: false,
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      getPath: vi.fn().mockReturnValue('/tmp/switchboard-test-main'),
    },
    BrowserWindow: Object.assign(BrowserWindowConstructor, {
      getAllWindows: vi.fn().mockReturnValue([]),
    }),
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
  };
});

vi.mock('ws', () => ({
  WebSocket: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 0,
  })),
  WebSocketServer: vi.fn(),
}));

vi.mock('../../src/main/local-daemon', () => ({
  LocalDaemon: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue({
      id: 'localhost',
      name: 'Localhost',
      host: '127.0.0.1',
      port: 3717,
      token: 'test',
      fingerprint: 'test',
      autoConnect: true,
    }),
    stop: vi.fn(),
  })),
}));

describe('createWindow', () => {
  beforeEach(() => {
    allConstructorCalls = [];
    mockLoadURL.mockClear();
    mockLoadFile.mockClear();
  });

  it('creates a BrowserWindow with security settings', async () => {
    const { createWindow } = await import('../../src/main/main');
    createWindow();

    const lastCall = allConstructorCalls[allConstructorCalls.length - 1];
    const prefs = lastCall.webPreferences as Record<string, unknown>;

    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
  });

  it('sets default window dimensions', async () => {
    const { createWindow } = await import('../../src/main/main');
    createWindow();

    const lastCall = allConstructorCalls[allConstructorCalls.length - 1];
    expect(lastCall.width).toBe(1200);
    expect(lastCall.height).toBe(800);
  });

  it('specifies a preload script path', async () => {
    const { createWindow } = await import('../../src/main/main');
    createWindow();

    const lastCall = allConstructorCalls[allConstructorCalls.length - 1];
    const prefs = lastCall.webPreferences as Record<string, unknown>;
    expect(prefs.preload).toBeDefined();
    expect(typeof prefs.preload).toBe('string');
    expect((prefs.preload as string).endsWith('preload.js')).toBe(true);
  });

  it('loads dev server URL when not packaged', async () => {
    const { createWindow } = await import('../../src/main/main');
    createWindow();

    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
  });
});
