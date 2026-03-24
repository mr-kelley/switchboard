import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { parseShortcut, DEFAULT_SHORTCUTS, useKeyboardShortcuts } from '../../../src/renderer/hooks/useKeyboardShortcuts';

describe('parseShortcut', () => {
  it('parses Control+key', () => {
    const parsed = parseShortcut('Control+n');
    expect(parsed.ctrlKey).toBe(true);
    expect(parsed.shiftKey).toBe(false);
    expect(parsed.altKey).toBe(false);
    expect(parsed.key).toBe('n');
  });

  it('parses Control+Shift+key', () => {
    const parsed = parseShortcut('Control+Shift+Tab');
    expect(parsed.ctrlKey).toBe(true);
    expect(parsed.shiftKey).toBe(true);
    expect(parsed.key).toBe('tab');
  });

  it('parses single number key with modifier', () => {
    const parsed = parseShortcut('Control+1');
    expect(parsed.ctrlKey).toBe(true);
    expect(parsed.key).toBe('1');
  });

  it('parses special characters', () => {
    const parsed = parseShortcut('Control+=');
    expect(parsed.ctrlKey).toBe(true);
    expect(parsed.key).toBe('=');
  });

  it('parses CommandOrControl', () => {
    const parsed = parseShortcut('CommandOrControl+n');
    expect(parsed.ctrlKey).toBe(true);
    expect(parsed.metaKey).toBe(true);
    expect(parsed.key).toBe('n');
  });
});

describe('DEFAULT_SHORTCUTS', () => {
  it('includes session switching shortcuts', () => {
    expect(DEFAULT_SHORTCUTS['session:1']).toBeDefined();
    expect(DEFAULT_SHORTCUTS['session:9']).toBeDefined();
    expect(DEFAULT_SHORTCUTS['session:new']).toBeDefined();
    expect(DEFAULT_SHORTCUTS['session:close']).toBeDefined();
  });

  it('includes navigation shortcuts', () => {
    expect(DEFAULT_SHORTCUTS['session:next']).toBeDefined();
    expect(DEFAULT_SHORTCUTS['session:prev']).toBeDefined();
    expect(DEFAULT_SHORTCUTS['app:toggle-sidebar']).toBeDefined();
  });

  it('does not include terminal-conflicting shortcuts (Ctrl+C/V/X/A/Z)', () => {
    const values = Object.values(DEFAULT_SHORTCUTS);
    const conflicting = ['Control+c', 'Control+v', 'Control+x', 'Control+a', 'Control+z'];
    for (const combo of conflicting) {
      expect(values).not.toContain(combo);
    }
  });
});

describe('useKeyboardShortcuts', () => {
  let listeners: Map<string, EventListener>;

  beforeEach(() => {
    listeners = new Map();
    vi.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: EventListener) => {
      listeners.set(event, handler);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((event: string) => {
      listeners.delete(event);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a keydown listener', () => {
    renderHook(() => useKeyboardShortcuts({}, {}));
    expect(listeners.has('keydown')).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts({}, {}));
    expect(listeners.has('keydown')).toBe(true);
    unmount();
    expect(listeners.has('keydown')).toBe(false);
  });

  it('fires handler on matching shortcut', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({}, { 'session:new': handler }));

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });
    listeners.get('keydown')!(event);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire handler for non-matching shortcut', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({}, { 'session:new': handler }));

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: false,
      bubbles: true,
    });
    listeners.get('keydown')!(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('user overrides take precedence over defaults', () => {
    const handler = vi.fn();
    // Override session:new from Control+n to Control+m
    renderHook(() => useKeyboardShortcuts(
      { 'session:new': 'Control+m' },
      { 'session:new': handler }
    ));

    // Original Ctrl+N should not fire
    const event1 = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    listeners.get('keydown')!(event1);
    expect(handler).not.toHaveBeenCalled();

    // New Ctrl+M should fire
    const event2 = new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true });
    Object.defineProperty(event2, 'preventDefault', { value: vi.fn() });
    listeners.get('keydown')!(event2);
    expect(handler).toHaveBeenCalledOnce();
  });
});
