import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xterm.js
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(), focus: vi.fn(), cols: 80, rows: 24,
  })),
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), dispose: vi.fn() })) }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock('@xterm/addon-webgl', () => { throw new Error('No WebGL'); });

beforeEach(() => {
  (window as any).switchboard = {
    platform: 'linux',
    pty: {
      spawn: vi.fn(), resize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(), input: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    session: {
      list: vi.fn().mockResolvedValue([]),
      onStatusChanged: vi.fn().mockReturnValue(() => {}),
    },
  };
});

import App from '../../src/renderer/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByTestId('app-container')).toBeInTheDocument();
  });

  it('renders a sidebar', () => {
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders a header with app title', () => {
    render(<App />);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Switchboard')).toBeInTheDocument();
  });

  it('shows empty state message', () => {
    render(<App />);
    expect(screen.getByTestId('terminal-area')).toHaveTextContent('New Session');
  });

  it('renders Sessions heading in sidebar', () => {
    render(<App />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders a New Session button', () => {
    render(<App />);
    expect(screen.getByTestId('new-session-button')).toBeInTheDocument();
  });
});
