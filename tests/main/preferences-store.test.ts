import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(os.tmpdir()),
  },
}));

import { PreferencesStore, getDefaultPreferences } from '../../src/main/preferences-store';

describe('PreferencesStore', () => {
  let storePath: string;
  let store: PreferencesStore;

  beforeEach(() => {
    storePath = path.join(os.tmpdir(), `switchboard-prefs-test-${Date.now()}.json`);
    store = new PreferencesStore(storePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(storePath); } catch { /* */ }
  });

  it('load returns defaults when file does not exist', () => {
    const prefs = store.load();
    const defaults = getDefaultPreferences();
    expect(prefs).toEqual(defaults);
  });

  it('save and load round-trip preserves all fields', () => {
    const defaults = getDefaultPreferences();
    defaults.terminalFontSize = 18;
    defaults.themeName = 'dracula';
    store.save(defaults);
    const loaded = store.load();
    expect(loaded.terminalFontSize).toBe(18);
    expect(loaded.themeName).toBe('dracula');
    expect(loaded).toEqual(defaults);
  });

  it('load returns defaults for corrupt JSON', () => {
    fs.writeFileSync(storePath, 'not valid json!!!', 'utf-8');
    const prefs = store.load();
    expect(prefs).toEqual(getDefaultPreferences());
  });

  it('deep-merges partial JSON with defaults — missing top-level field', () => {
    const partial = { terminalFontSize: 20 };
    fs.writeFileSync(storePath, JSON.stringify(partial), 'utf-8');
    const prefs = store.load();
    expect(prefs.terminalFontSize).toBe(20);
    // Missing fields filled from defaults
    expect(prefs.themeName).toBe('catppuccin-mocha');
    expect(prefs.cursorBlink).toBe(true);
    expect(prefs.terminalColors).toBeDefined();
    expect(prefs.uiColors).toBeDefined();
  });

  it('deep-merges partial JSON with defaults — missing nested key', () => {
    const partial = {
      terminalColors: {
        background: '#000000',
        // all other keys missing
      },
    };
    fs.writeFileSync(storePath, JSON.stringify(partial), 'utf-8');
    const prefs = store.load();
    expect(prefs.terminalColors.background).toBe('#000000');
    // Missing nested keys filled from defaults
    expect(prefs.terminalColors.foreground).toBe(getDefaultPreferences().terminalColors.foreground);
    expect(prefs.terminalColors.cursor).toBe(getDefaultPreferences().terminalColors.cursor);
  });

  it('arrays are replaced entirely, not merged', () => {
    const partial = { sessionOrder: ['id-1', 'id-2'] };
    fs.writeFileSync(storePath, JSON.stringify(partial), 'utf-8');
    const prefs = store.load();
    expect(prefs.sessionOrder).toEqual(['id-1', 'id-2']);
  });

  it('strips unknown keys not in defaults', () => {
    const partial = { terminalFontSize: 16, unknownKey: 'should be stripped' };
    fs.writeFileSync(storePath, JSON.stringify(partial), 'utf-8');
    const prefs = store.load();
    expect(prefs.terminalFontSize).toBe(16);
    expect((prefs as Record<string, unknown>)['unknownKey']).toBeUndefined();
  });

  it('reset deletes file and returns defaults', () => {
    store.save(getDefaultPreferences());
    expect(fs.existsSync(storePath)).toBe(true);
    const prefs = store.reset();
    expect(fs.existsSync(storePath)).toBe(false);
    expect(prefs).toEqual(getDefaultPreferences());
  });

  it('getDefaults returns a complete SwitchboardPreferences', () => {
    const defaults = getDefaultPreferences();
    expect(defaults.terminalFontFamily).toBeDefined();
    expect(defaults.terminalFontSize).toBe(14);
    expect(defaults.terminalLineHeight).toBe(1.2);
    expect(defaults.uiFontFamily).toBeDefined();
    expect(defaults.uiFontSize).toBe(13);
    expect(defaults.themeName).toBe('catppuccin-mocha');
    expect(defaults.terminalColors).toBeDefined();
    expect(defaults.uiColors).toBeDefined();
    expect(defaults.terminalBackgroundImage).toBeNull();
    expect(defaults.terminalBackgroundOpacity).toBe(0.3);
    expect(defaults.sidebarBackgroundImage).toBeNull();
    expect(defaults.windowOpacity).toBe(1.0);
    expect(defaults.terminalBackgroundAlpha).toBe(1.0);
    expect(defaults.shortcuts).toEqual({});
    expect(defaults.sessionOrder).toEqual([]);
    expect(defaults.cursorBlink).toBe(true);
    expect(defaults.scrollbackLines).toBe(5000);
  });
});
