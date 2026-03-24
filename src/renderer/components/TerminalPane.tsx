import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  sessionId: string;
  visible: boolean;
}

const TERMINAL_THEME = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

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

  // Keep visibility ref in sync
  visibleRef.current = visible;

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: TERMINAL_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
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
      ref={containerRef}
      data-testid={`terminal-pane-${sessionId}`}
      style={{
        display: visible ? 'block' : 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  );
}
