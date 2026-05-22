import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { usePreferences } from '../state/preferences';
import QueuedPromptBar from './QueuedPromptBar';

interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;
  searchVisible?: boolean;
  onSearchClose?: () => void;
  queueBarVisible?: boolean;
  onQueueBarClose?: () => void;
}

/** Convert a hex color to an rgba() string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function tryAttachWebgl(terminal: Terminal): { dispose: () => void } | null {
  try {
    const { WebglAddon } = require('@xterm/addon-webgl');
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      try {
        addon.dispose();
      } catch {
        // Already disposed
      }
    });
    terminal.loadAddon(addon);
    return addon;
  } catch {
    return null;
  }
}

function tryAttachSearch(terminal: Terminal): { findNext: (query: string) => boolean; findPrevious: (query: string) => boolean; clearDecorations: () => void; dispose: () => void } | null {
  try {
    const { SearchAddon } = require('@xterm/addon-search');
    const addon = new SearchAddon();
    terminal.loadAddon(addon);
    return addon;
  } catch {
    return null;
  }
}

export default function TerminalPane({ sessionId, visible, searchVisible, onSearchClose, queueBarVisible, onQueueBarClose }: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<{ dispose: () => void } | null>(null);
  const visibleRef = useRef(visible);
  const needsResizeRef = useRef(false);
  const searchAddonRef = useRef<ReturnType<typeof tryAttachSearch>>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { prefs } = usePreferences();

  // Keep visibility ref in sync
  visibleRef.current = visible;

  useEffect(() => {
    if (!containerRef.current) return;

    const hasBackgroundImage = !!prefs.terminalBackgroundImage;
    const theme = hasBackgroundImage
      ? { ...prefs.terminalColors, background: hexToRgba(prefs.terminalColors.background || '#000000', 1 - prefs.terminalBackgroundOpacity) }
      : prefs.terminalColors;

    const terminal = new Terminal({
      theme,
      fontFamily: prefs.terminalFontFamily,
      fontSize: prefs.terminalFontSize,
      lineHeight: prefs.terminalLineHeight,
      cursorBlink: prefs.cursorBlink,
      scrollback: prefs.scrollbackLines,
      allowProposedApi: true,
      allowTransparency: hasBackgroundImage,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);

    // Attach WebGL after open (skip if using background image — WebGL doesn't support transparency)
    webglAddonRef.current = hasBackgroundImage ? null : tryAttachWebgl(terminal);

    // Attach search addon
    searchAddonRef.current = tryAttachSearch(terminal);

    // Fit after open
    try {
      fitAddon.fit();
    } catch {
      // Container might not have dimensions yet
    }

    // Send initial dimensions to PTY
    window.switchboard.pty.resize(sessionId, terminal.cols, terminal.rows);

    // Wire up data flow
    const unsubData = window.switchboard.pty.onData((sid: string, data: string) => {
      if (sid === sessionId) {
        terminal.write(data);
      }
    });

    terminal.onData((data: string) => {
      window.switchboard.pty.input(sessionId, data);
    });

    // Request replay buffer for any history the daemon already has for this
    // session — covers both client-restart (fresh client, daemon-side session)
    // and daemon-restart (sessions restored from disk with persisted buffers).
    window.switchboard.session.requestReplay(sessionId).catch(() => {});

    // Handle window resize — only fit if visible, otherwise defer
    const handleResize = () => {
      if (!visibleRef.current) {
        needsResizeRef.current = true;
        return;
      }
      try {
        fitAddon.fit();
        window.switchboard.pty.resize(sessionId, terminal.cols, terminal.rows);
      } catch {
        // Ignore fit errors during transitions
      }
    };

    window.addEventListener('resize', handleResize);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      window.removeEventListener('resize', handleResize);
      unsubData();
      terminal.dispose();
    };
  }, [sessionId, !!prefs.terminalBackgroundImage]);

  // Update terminal options when prefs change
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const hasBackgroundImage = !!prefs.terminalBackgroundImage;
    terminal.options.theme = hasBackgroundImage
      ? { ...prefs.terminalColors, background: hexToRgba(prefs.terminalColors.background || '#000000', 1 - prefs.terminalBackgroundOpacity) }
      : prefs.terminalColors;
    terminal.options.fontFamily = prefs.terminalFontFamily;
    terminal.options.fontSize = prefs.terminalFontSize;
    terminal.options.lineHeight = prefs.terminalLineHeight;
    terminal.options.cursorBlink = prefs.cursorBlink;
    terminal.options.scrollback = prefs.scrollbackLines;
    // Re-fit after font change
    if (visibleRef.current && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
        window.switchboard.pty.resize(sessionId, terminal.cols, terminal.rows);
      } catch {
        // Ignore
      }
    }
  }, [prefs.terminalColors, prefs.terminalFontFamily, prefs.terminalFontSize, prefs.terminalLineHeight, prefs.cursorBlink, prefs.scrollbackLines, prefs.terminalBackgroundImage, prefs.terminalBackgroundOpacity, sessionId]);

  // Re-fit when the queue bar toggles — the container height changes.
  useEffect(() => {
    if (!visibleRef.current) return;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;
    const timer = setTimeout(() => {
      try {
        fitAddon.fit();
        window.switchboard.pty.resize(sessionId, terminal.cols, terminal.rows);
      } catch {
        // Ignore fit errors during transitions
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [queueBarVisible, sessionId]);

  // Re-fit, re-attach WebGL, and focus when visibility changes
  useEffect(() => {
    if (visible && fitAddonRef.current && terminalRef.current) {
      const timer = setTimeout(() => {
        const terminal = terminalRef.current;
        const fitAddon = fitAddonRef.current;
        if (!terminal || !fitAddon) return;

        try {
          // Re-attach WebGL if it was lost while hidden
          if (!webglAddonRef.current) {
            webglAddonRef.current = tryAttachWebgl(terminal);
          }

          // Always fit on visibility change (handles deferred resizes too)
          fitAddon.fit();
          window.switchboard.pty.resize(sessionId, terminal.cols, terminal.rows);
          needsResizeRef.current = false;

          terminal.focus();
        } catch {
          // Ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible, sessionId]);

  const handleClick = () => {
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  };

  return (
    <div
      data-testid={`terminal-pane-${sessionId}`}
      onClick={handleClick}
      style={{
        display: visible ? 'block' : 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {prefs.terminalBackgroundImage && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url(${prefs.terminalBackgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: prefs.terminalBackgroundOpacity,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      {searchVisible && (
        <div
          data-testid={`search-bar-${sessionId}`}
          style={{
            position: 'absolute',
            top: 8,
            right: 16,
            zIndex: 10,
            display: 'flex',
            gap: 4,
            backgroundColor: prefs.uiColors.inputBg,
            border: `1px solid ${prefs.uiColors.inputBorder}`,
            borderRadius: 4,
            padding: '4px 8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <input
            data-testid={`search-input-${sessionId}`}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) {
                  searchAddonRef.current?.findPrevious(searchQuery);
                } else {
                  searchAddonRef.current?.findNext(searchQuery);
                }
              }
              if (e.key === 'Escape') {
                searchAddonRef.current?.clearDecorations();
                setSearchQuery('');
                onSearchClose?.();
              }
            }}
            placeholder="Search..."
            autoFocus
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: prefs.uiColors.inputText,
              fontSize: 12,
              outline: 'none',
              width: 180,
            }}
          />
          <button
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
            style={{ backgroundColor: 'transparent', border: 'none', color: prefs.uiColors.appTextMuted, cursor: 'pointer', fontSize: 12 }}
          >
            &#9650;
          </button>
          <button
            onClick={() => searchAddonRef.current?.findNext(searchQuery)}
            style={{ backgroundColor: 'transparent', border: 'none', color: prefs.uiColors.appTextMuted, cursor: 'pointer', fontSize: 12 }}
          >
            &#9660;
          </button>
          <button
            onClick={() => {
              searchAddonRef.current?.clearDecorations();
              setSearchQuery('');
              onSearchClose?.();
            }}
            style={{ backgroundColor: 'transparent', border: 'none', color: prefs.uiColors.appTextMuted, cursor: 'pointer', fontSize: 12 }}
          >
            &#10005;
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: queueBarVisible ? 40 : 0,
          zIndex: 1,
        }}
      />
      {queueBarVisible && onQueueBarClose && (
        <QueuedPromptBar sessionId={sessionId} onClose={onQueueBarClose} />
      )}
    </div>
  );
}
