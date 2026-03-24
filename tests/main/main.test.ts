import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron modules
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();

let allConstructorCalls: Array<Record<string, unknown>> = [];

vi.mock('electron', () => {
  const BrowserWindowConstructor = vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    allConstructorCalls.push(opts);
    return {
      loadURL: mockLoadURL,
      loadFile: mockLoadFile,
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
  };
});

vi.mock('node-pty', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 1,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  }),
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

    // Find the call from our explicit createWindow() (last call)
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
