import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { usePreferences } from '../state/preferences';

interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;
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

export default function TerminalPane({ sessionId, visible }: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<{ dispose: () => void } | null>(null);
  const visibleRef = useRef(visible);
  const needsResizeRef = useRef(false);
  const { prefs } = usePreferences();

  // Keep visibility ref in sync
  visibleRef.current = visible;

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: prefs.terminalColors,
      fontFamily: prefs.terminalFontFamily,
      fontSize: prefs.terminalFontSize,
      lineHeight: prefs.terminalLineHeight,
      cursorBlink: prefs.cursorBlink,
      scrollback: prefs.scrollbackLines,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);

    // Attach WebGL after open
    webglAddonRef.current = tryAttachWebgl(terminal);

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
  }, [sessionId]);

  // Update terminal options when prefs change
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = prefs.terminalColors;
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
  }, [prefs.terminalColors, prefs.terminalFontFamily, prefs.terminalFontSize, prefs.terminalLineHeight, prefs.cursorBlink, prefs.scrollbackLines, sessionId]);

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

  return (
    <div
      data-testid={`terminal-pane-${sessionId}`}
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
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1,
        }}
      />
    </div>
  );
}
