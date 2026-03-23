import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

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

export default function TerminalPane({ sessionId, visible }: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

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

    // Try WebGL, fall back to canvas
    try {
      const { WebglAddon } = require('@xterm/addon-webgl');
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available — canvas renderer is fine
    }

    terminal.open(containerRef.current);

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

    // Handle resize
    const handleResize = () => {
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

    cleanupRef.current = () => {
      window.removeEventListener('resize', handleResize);
      unsubData();
      terminal.dispose();
    };

    return () => {
      cleanupRef.current?.();
    };
  }, [sessionId]);

  // Re-fit and focus when visibility changes
  useEffect(() => {
    if (visible && fitAddonRef.current && terminalRef.current) {
      // Small delay to let CSS display change take effect
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          terminalRef.current?.focus();
        } catch {
          // Ignore
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      data-testid={`terminal-pane-${sessionId}`}
      style={{
        display: visible ? 'block' : 'none',
        width: '100%',
        height: '100%',
      }}
    />
  );
}
