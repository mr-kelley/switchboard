import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SwitchboardPreferences } from '../shared/types';
import { THEME_PRESETS } from '../shared/themes';

const DEFAULT_THEME = 'catppuccin-mocha';

export function getDefaultPreferences(): SwitchboardPreferences {
  const preset = THEME_PRESETS[DEFAULT_THEME];
  return {
    terminalFontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    terminalFontSize: 14,
    terminalLineHeight: 1.2,
    uiFontFamily: 'system-ui, -apple-system, sans-serif',
    uiFontSize: 13,
    themeName: DEFAULT_THEME,
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
}

function deepMerge(defaults: Record<string, unknown>, saved: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(saved)) {
    if (!(key in defaults)) continue; // strip unknown keys
    const defaultVal = defaults[key];
    const savedVal = saved[key];
    if (
      defaultVal !== null &&
      savedVal !== null &&
      typeof defaultVal === 'object' &&
      typeof savedVal === 'object' &&
      !Array.isArray(defaultVal) &&
      !Array.isArray(savedVal)
    ) {
      result[key] = deepMerge(
        defaultVal as Record<string, unknown>,
        savedVal as Record<string, unknown>
      );
    } else {
      result[key] = savedVal;
    }
  }
  return result;
}

export class PreferencesStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(app.getPath('userData'), 'preferences.json');
  }

  load(): SwitchboardPreferences {
    try {
      if (!fs.existsSync(this.filePath)) {
        return getDefaultPreferences();
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const saved = JSON.parse(raw);
      if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
        return getDefaultPreferences();
      }
      const defaults = getDefaultPreferences();
      return deepMerge(
        defaults as unknown as Record<string, unknown>,
        saved as Record<string, unknown>
      ) as unknown as SwitchboardPreferences;
    } catch {
      console.warn('Failed to load preferences, using defaults');
      return getDefaultPreferences();
    }
  }

  save(prefs: SwitchboardPreferences): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(prefs, null, 2), 'utf-8');
    } catch {
      console.error('Failed to save preferences');
    }
  }

  reset(): SwitchboardPreferences {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      console.error('Failed to delete preferences file');
    }
    return getDefaultPreferences();
  }
}
