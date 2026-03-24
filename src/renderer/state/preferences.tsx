import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { SwitchboardPreferences } from '../../shared/types';
import { THEME_PRESETS } from '../../shared/themes';

const DEFAULT_THEME = 'catppuccin-mocha';

function getDefaultPreferences(): SwitchboardPreferences {
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

function mergePrefs(
  current: SwitchboardPreferences,
  partial: Partial<SwitchboardPreferences>
): SwitchboardPreferences {
  const result = { ...current };
  for (const key of Object.keys(partial) as (keyof SwitchboardPreferences)[]) {
    const val = partial[key];
    if (val === undefined) continue;
    const currentVal = current[key];
    if (
      currentVal !== null &&
      val !== null &&
      typeof currentVal === 'object' &&
      typeof val === 'object' &&
      !Array.isArray(currentVal) &&
      !Array.isArray(val)
    ) {
      (result as Record<string, unknown>)[key] = { ...currentVal, ...val };
    } else {
      (result as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}

interface PreferencesContextValue {
  prefs: SwitchboardPreferences;
  updatePrefs: (partial: Partial<SwitchboardPreferences>) => void;
  resetPrefs: () => void;
  loading: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [prefs, setPrefs] = useState<SwitchboardPreferences>(getDefaultPreferences);
  const [loading, setLoading] = useState(true);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Load preferences on mount
  useEffect(() => {
    window.switchboard.preferences
      .load()
      .then((loaded) => {
        setPrefs((current) => mergePrefs(current, loaded));
      })
      .catch(() => {
        console.warn('Failed to load preferences, using defaults');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Subscribe to external preference changes
  useEffect(() => {
    const unsub = window.switchboard.preferences.onChanged((changed) => {
      setPrefs(changed as SwitchboardPreferences);
    });
    return unsub;
  }, []);

  const updatePrefs = useCallback((partial: Partial<SwitchboardPreferences>) => {
    setPrefs((current) => {
      const merged = mergePrefs(current, partial);
      window.switchboard.preferences.save(merged).catch(() => {
        console.warn('Failed to save preferences');
      });
      return merged;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    window.switchboard.preferences
      .reset()
      .then((defaults) => {
        setPrefs(defaults as SwitchboardPreferences);
      })
      .catch(() => {
        console.warn('Failed to reset preferences');
        setPrefs(getDefaultPreferences());
      });
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, updatePrefs, resetPrefs, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
