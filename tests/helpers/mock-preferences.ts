import { vi } from 'vitest';
import { THEME_PRESETS } from '../../src/shared/themes';

const preset = THEME_PRESETS['catppuccin-mocha'];

export const mockPrefs = {
  terminalFontFamily: "'JetBrains Mono', monospace",
  terminalFontSize: 14,
  terminalLineHeight: 1.2,
  uiFontFamily: 'system-ui, sans-serif',
  uiFontSize: 13,
  themeName: 'catppuccin-mocha',
  terminalColors: { ...preset.terminal },
  uiColors: { ...preset.ui },
  terminalBackgroundImage: null,
  terminalBackgroundOpacity: 0.3,
  sidebarBackgroundImage: null,
  windowOpacity: 1.0,
  terminalBackgroundAlpha: 1.0,
  shortcuts: {},
  sessionOrder: [],
  cursorBlink: true,
  scrollbackLines: 5000,
};

export const mockUsePreferences = {
  prefs: mockPrefs,
  updatePrefs: vi.fn(),
  resetPrefs: vi.fn(),
  loading: false,
};
