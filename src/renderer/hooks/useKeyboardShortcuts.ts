import { useEffect, useRef } from 'react';

export interface ParsedShortcut {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string; // lowercase
}

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'session:new': 'Control+n',
  'session:close': 'Control+w',
  'session:next': 'Control+Tab',
  'session:prev': 'Control+Shift+Tab',
  'session:1': 'Control+1',
  'session:2': 'Control+2',
  'session:3': 'Control+3',
  'session:4': 'Control+4',
  'session:5': 'Control+5',
  'session:6': 'Control+6',
  'session:7': 'Control+7',
  'session:8': 'Control+8',
  'session:9': 'Control+9',
  'app:toggle-sidebar': 'Control+b',
  'app:preferences': 'Control+,',
  'terminal:zoom-in': 'Control+=',
  'terminal:zoom-out': 'Control+-',
  'terminal:zoom-reset': 'Control+0',
};

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split('+');
  const modifiers = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));
  const key = parts[parts.length - 1];

  return {
    ctrlKey: modifiers.has('control') || modifiers.has('commandorcontrol'),
    shiftKey: modifiers.has('shift'),
    altKey: modifiers.has('alt'),
    metaKey: modifiers.has('meta') || modifiers.has('commandorcontrol'),
    key: key.toLowerCase(),
  };
}

function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  // For CommandOrControl, accept either ctrlKey or metaKey
  const ctrlMatch = parsed.ctrlKey ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const shiftMatch = parsed.shiftKey === event.shiftKey;
  const altMatch = parsed.altKey === event.altKey;
  const keyMatch = event.key.toLowerCase() === parsed.key;

  return ctrlMatch && shiftMatch && altMatch && keyMatch;
}

export function useKeyboardShortcuts(
  shortcuts: Record<string, string>,
  handlers: Record<string, () => void>
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Merge user shortcuts with defaults (user takes precedence)
      const merged = { ...DEFAULT_SHORTCUTS, ...shortcutsRef.current };

      for (const [action, shortcutStr] of Object.entries(merged)) {
        const handler = handlersRef.current[action];
        if (!handler) continue;

        const parsed = parseShortcut(shortcutStr);
        if (matchesShortcut(event, parsed)) {
          event.preventDefault();
          try {
            handler();
          } catch (err) {
            console.error(`Shortcut handler error for ${action}:`, err);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
