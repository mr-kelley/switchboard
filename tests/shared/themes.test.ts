import { describe, it, expect } from 'vitest';
import { THEME_PRESETS } from '../../src/shared/themes';
import type { TerminalThemeColors, UIThemeColors } from '../../src/shared/types';

const TERMINAL_COLOR_KEYS: (keyof TerminalThemeColors)[] = [
  'background', 'foreground', 'cursor', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

const UI_COLOR_KEYS: (keyof UIThemeColors)[] = [
  'appBg', 'appText', 'appTextMuted', 'appTextFaint',
  'sidebarBg', 'sidebarBorder', 'sidebarHeaderText',
  'headerBg', 'headerBorder', 'headerText',
  'tabActiveBg', 'tabActiveText', 'tabInactiveText',
  'buttonBg', 'buttonText', 'buttonHoverBg', 'buttonPrimaryBg', 'buttonPrimaryText', 'buttonBorder',
  'contextMenuBg', 'contextMenuBorder', 'contextMenuText', 'contextMenuHoverBg',
  'modalOverlayBg', 'modalBg', 'modalBorder', 'modalText',
  'inputBg', 'inputBorder', 'inputText',
  'statusWorking', 'statusIdle', 'statusNeedsAttention', 'statusDefault',
  'accentPrimary', 'errorText',
];

const HEX_OR_RGBA = /^(#[0-9a-fA-F]{6}|rgba?\(.+\))$/;

describe('Theme Presets', () => {
  it('includes catppuccin-mocha as default theme', () => {
    expect(THEME_PRESETS['catppuccin-mocha']).toBeDefined();
  });

  it('includes all 6 expected presets', () => {
    const expected = ['catppuccin-mocha', 'catppuccin-latte', 'dracula', 'nord', 'solarized-dark', 'one-dark'];
    for (const name of expected) {
      expect(THEME_PRESETS[name]).toBeDefined();
    }
  });

  for (const [name, preset] of Object.entries(THEME_PRESETS)) {
    describe(`preset: ${name}`, () => {
      it('has a label', () => {
        expect(typeof preset.label).toBe('string');
        expect(preset.label.length).toBeGreaterThan(0);
      });

      it('has all required TerminalThemeColors keys', () => {
        for (const key of TERMINAL_COLOR_KEYS) {
          expect(preset.terminal[key]).toBeDefined();
          expect(typeof preset.terminal[key]).toBe('string');
        }
      });

      it('has all required UIThemeColors keys', () => {
        for (const key of UI_COLOR_KEYS) {
          expect(preset.ui[key]).toBeDefined();
          expect(typeof preset.ui[key]).toBe('string');
        }
      });

      it('terminal colors are valid hex or rgba strings', () => {
        for (const key of TERMINAL_COLOR_KEYS) {
          expect(preset.terminal[key]).toMatch(HEX_OR_RGBA);
        }
      });

      it('UI colors are valid hex or rgba strings', () => {
        for (const key of UI_COLOR_KEYS) {
          expect(preset.ui[key]).toMatch(HEX_OR_RGBA);
        }
      });
    });
  }
});
