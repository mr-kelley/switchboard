import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xterm.js and addons since they need a real DOM canvas
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(),
    focus: vi.fn(),
    cols: 80,
    rows: 24,
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-webgl', () => {
  throw new Error('WebGL not available in test');
});

// Mock the preload API on window
const mockResize = vi.fn().mockResolvedValue(undefined);
const mockInput = vi.fn();
const mockOnData = vi.fn().mockReturnValue(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).switchboard = {
    platform: 'linux',
    pty: {
      resize: mockResize,
      input: mockInput,
      onData: mockOnData,
    },
  };
});

import TerminalPane from '../../src/renderer/components/TerminalPane';

describe('TerminalPane', () => {
  it('renders a container div', () => {
    const { getByTestId } = render(
      <TerminalPane sessionId="test-session" visible={true} />
    );
    expect(getByTestId('terminal-pane-test-session')).toBeInTheDocument();
  });

  it('sets display block when visible', () => {
    const { getByTestId } = render(
      <TerminalPane sessionId="test-session" visible={true} />
    );
    expect(getByTestId('terminal-pane-test-session').style.display).toBe('block');
  });

  it('sets display none when not visible', () => {
    const { getByTestId } = render(
      <TerminalPane sessionId="test-session" visible={false} />
    );
    expect(getByTestId('terminal-pane-test-session').style.display).toBe('none');
  });

  it('subscribes to PTY data on mount', () => {
    render(<TerminalPane sessionId="test-session" visible={true} />);
    expect(mockOnData).toHaveBeenCalled();
  });

  it('sends initial resize to PTY on mount', () => {
    render(<TerminalPane sessionId="test-session" visible={true} />);
    expect(mockResize).toHaveBeenCalledWith('test-session', 80, 24);
  });

  it('uses absolute positioning to fill container', () => {
    const { getByTestId } = render(
      <TerminalPane sessionId="test-session" visible={true} />
    );
    const container = getByTestId('terminal-pane-test-session');
    expect(container.style.position).toBe('absolute');
    expect(container.style.top).toBe('0px');
    expect(container.style.bottom).toBe('0px');
  });
});
