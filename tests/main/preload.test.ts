import { describe, it, expect, vi, beforeEach } from 'vitest';

let exposedApi: Record<string, unknown> = {};

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((channel: string, api: Record<string, unknown>) => {
      if (channel === 'switchboard') {
        exposedApi = api;
      }
    }),
  },
}));

describe('preload script', () => {
  beforeEach(() => {
    exposedApi = {};
    vi.resetModules();
  });

  it('exposes a switchboard API via contextBridge', async () => {
    await import('../../src/main/preload');
    expect(exposedApi).toBeDefined();
    expect(Object.keys(exposedApi).length).toBeGreaterThan(0);
  });

  it('exposes platform information', async () => {
    await import('../../src/main/preload');
    expect(exposedApi.platform).toBe(process.platform);
  });

  it('does not expose ipcRenderer directly', async () => {
    await import('../../src/main/preload');
    expect(exposedApi).not.toHaveProperty('ipcRenderer');
  });

  it('does not expose require or other Node globals', async () => {
    await import('../../src/main/preload');
    expect(exposedApi).not.toHaveProperty('require');
    expect(exposedApi).not.toHaveProperty('process');
    expect(exposedApi).not.toHaveProperty('Buffer');
  });
});
