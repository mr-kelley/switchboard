import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock xterm (required by some transitive imports)
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(), focus: vi.fn(), cols: 80, rows: 24,
  })),
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), dispose: vi.fn() })) }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock('@xterm/addon-webgl', () => { throw new Error('No WebGL'); });

const mockLoad = vi.fn().mockResolvedValue({});
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockReset = vi.fn().mockResolvedValue({});
const mockOnChanged = vi.fn().mockReturnValue(() => {});

beforeEach(() => {
  (window as any).switchboard = {
    platform: 'linux',
    pty: {
      spawn: vi.fn(), resize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(), input: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    session: {
      list: vi.fn().mockResolvedValue([]),
      onStatusChanged: vi.fn().mockReturnValue(() => {}),
    },
    preferences: {
      load: mockLoad,
      save: mockSave,
      reset: mockReset,
      onChanged: mockOnChanged,
    },
  };
  mockLoad.mockClear().mockResolvedValue({});
  mockSave.mockClear().mockResolvedValue(undefined);
  mockReset.mockClear().mockResolvedValue({});
  mockOnChanged.mockClear().mockReturnValue(() => {});
});

import { PreferencesProvider, usePreferences } from '../../../src/renderer/state/preferences';

describe('PreferencesProvider', () => {
  it('renders children', async () => {
    await act(async () => {
      render(
        <PreferencesProvider>
          <div data-testid="child">Hello</div>
        </PreferencesProvider>
      );
    });
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides default prefs initially', async () => {
    let prefs: any;
    function Consumer() {
      prefs = usePreferences().prefs;
      return null;
    }
    await act(async () => {
      render(
        <PreferencesProvider>
          <Consumer />
        </PreferencesProvider>
      );
    });
    expect(prefs).toBeDefined();
    expect(prefs.themeName).toBe('catppuccin-mocha');
    expect(prefs.terminalFontSize).toBe(14);
  });

  it('updatePrefs merges partial updates', async () => {
    let ctx: any;
    function Consumer() {
      ctx = usePreferences();
      return null;
    }
    await act(async () => {
      render(
        <PreferencesProvider>
          <Consumer />
        </PreferencesProvider>
      );
    });

    await act(async () => {
      ctx.updatePrefs({ terminalFontSize: 20 });
    });

    expect(ctx.prefs.terminalFontSize).toBe(20);
    // Other fields preserved
    expect(ctx.prefs.themeName).toBe('catppuccin-mocha');
    // Save was called
    expect(mockSave).toHaveBeenCalled();
  });

  it('loading starts true and becomes false', async () => {
    let loadingValues: boolean[] = [];
    function Consumer() {
      const { loading } = usePreferences();
      loadingValues.push(loading);
      return null;
    }
    await act(async () => {
      render(
        <PreferencesProvider>
          <Consumer />
        </PreferencesProvider>
      );
    });
    // Should have transitioned from true to false
    expect(loadingValues[0]).toBe(true);
    expect(loadingValues[loadingValues.length - 1]).toBe(false);
  });
});

describe('usePreferences', () => {
  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => usePreferences());
    }).toThrow('usePreferences must be used within a PreferencesProvider');
  });
});
