import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTrayInstance = {
  setImage: vi.fn(),
  setToolTip: vi.fn(),
  setContextMenu: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};
let mockTrayThrows = false;
const mockBuildFromTemplate = vi.fn((template: unknown) => ({ template }));

vi.mock('electron', () => ({
  Tray: vi.fn().mockImplementation(() => {
    if (mockTrayThrows) throw new Error('no tray host');
    return mockTrayInstance;
  }),
  Menu: { buildFromTemplate: (t: unknown) => mockBuildFromTemplate(t) },
  nativeImage: { createFromDataURL: vi.fn(() => ({ isEmpty: () => false })) },
}));

import { createTray, iconKeyForCount, tooltipForCount, type TrayDeps } from '../../src/main/tray';

type Summary = ReturnType<TrayDeps['connectionManager']['getAttentionSummary']>;

function makeDeps(summary: Summary): { deps: TrayDeps; fire: () => void; showWindow: ReturnType<typeof vi.fn>; focusAttention: ReturnType<typeof vi.fn>; quit: ReturnType<typeof vi.fn> } {
  const listeners: Array<() => void> = [];
  const showWindow = vi.fn();
  const focusAttention = vi.fn();
  const quit = vi.fn();
  const deps: TrayDeps = {
    connectionManager: {
      getAttentionSummary: () => summary,
      onAttentionChange: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
    } as unknown as TrayDeps['connectionManager'],
    showWindow,
    focusAttention,
    quit,
  };
  return { deps, fire: () => listeners.forEach((l) => l()), showWindow, focusAttention, quit };
}

const emptySummary: Summary = { total: 0, perDaemon: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockTrayThrows = false;
});

describe('iconKeyForCount', () => {
  it('maps counts to icon variants', () => {
    expect(iconKeyForCount(0)).toBe('base');
    expect(iconKeyForCount(-3)).toBe('base');
    expect(iconKeyForCount(1)).toBe('1');
    expect(iconKeyForCount(9)).toBe('9');
    expect(iconKeyForCount(10)).toBe('9+');
    expect(iconKeyForCount(99)).toBe('9+');
  });
});

describe('tooltipForCount', () => {
  it('is plain when zero', () => {
    expect(tooltipForCount(0)).toBe('Switchboard');
  });
  it('is singular for one', () => {
    expect(tooltipForCount(1)).toBe('Switchboard — 1 session needs attention');
  });
  it('is plural for many', () => {
    expect(tooltipForCount(3)).toBe('Switchboard — 3 sessions need attention');
  });
});

describe('createTray', () => {
  it('returns null without throwing when no tray host exists', () => {
    mockTrayThrows = true;
    const { deps } = makeDeps(emptySummary);
    expect(createTray(deps)).toBeNull();
  });

  it('sets image, tooltip, and menu on create', () => {
    const summary: Summary = {
      total: 2,
      perDaemon: [{ id: 'localhost', name: 'Localhost', status: 'connected', sessionCount: 3, attentionCount: 2 }],
    };
    const { deps } = makeDeps(summary);
    const handle = createTray(deps);
    expect(handle).not.toBeNull();
    expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Switchboard — 2 sessions need attention');
    expect(mockTrayInstance.setContextMenu).toHaveBeenCalled();
    const template = mockBuildFromTemplate.mock.calls.at(-1)![0] as Array<{ label?: string }>;
    expect(template.some((i) => i.label === 'Show Switchboard')).toBe(true);
    expect(template.some((i) => i.label === 'Quit')).toBe(true);
    expect(template.some((i) => i.label?.includes('Localhost') && i.label?.includes('2 need attention'))).toBe(true);
  });

  it('left-click shows the window and requests attention focus', () => {
    const { deps, showWindow, focusAttention } = makeDeps(emptySummary);
    createTray(deps);
    const clickCall = mockTrayInstance.on.mock.calls.find((c) => c[0] === 'click');
    expect(clickCall).toBeDefined();
    (clickCall![1] as () => void)();
    expect(showWindow).toHaveBeenCalledOnce();
    expect(focusAttention).toHaveBeenCalledOnce();
  });

  it('Quit menu item invokes the quit callback', () => {
    const { deps, quit } = makeDeps(emptySummary);
    createTray(deps);
    const template = mockBuildFromTemplate.mock.calls.at(-1)![0] as Array<{ label?: string; click?: () => void }>;
    const quitItem = template.find((i) => i.label === 'Quit');
    quitItem!.click!();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('refreshes on attention change and unsubscribes on destroy', () => {
    const { deps, fire } = makeDeps(emptySummary);
    const handle = createTray(deps)!;
    mockTrayInstance.setImage.mockClear();
    fire();
    expect(mockTrayInstance.setImage).toHaveBeenCalledTimes(1);
    handle.destroy();
    expect(mockTrayInstance.destroy).toHaveBeenCalledOnce();
    mockTrayInstance.setImage.mockClear();
    fire(); // unsubscribed — no further refresh
    expect(mockTrayInstance.setImage).not.toHaveBeenCalled();
  });
});
