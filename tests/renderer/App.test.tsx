import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock xterm.js
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(),
    onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    dispose: vi.fn(), focus: vi.fn(), cols: 80, rows: 24,
    options: {},
  })),
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn(), dispose: vi.fn() })) }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })) }));
vi.mock('@xterm/addon-webgl', () => { throw new Error('No WebGL'); });

beforeEach(() => {
  (window as any).switchboard = {
    platform: 'linux',
    dialog: {
      openFile: vi.fn().mockResolvedValue(null),
    },
    onCycleTab: vi.fn().mockReturnValue(() => {}),
    pty: {
      spawn: vi.fn(), resize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(), input: vi.fn(),
      onData: vi.fn().mockReturnValue(() => {}),
      onExit: vi.fn().mockReturnValue(() => {}),
    },
    session: {
      list: vi.fn().mockResolvedValue([]),
      onStatusChanged: vi.fn().mockReturnValue(() => {}),
      onSessionCreated: vi.fn().mockReturnValue(() => {}),
      queuePrompt: vi.fn().mockResolvedValue(undefined),
      clearQueue: vi.fn().mockResolvedValue(undefined),
      onQueueUpdated: vi.fn().mockReturnValue(() => {}),
      onQueueRejected: vi.fn().mockReturnValue(() => {}),
      onQueueSync: vi.fn().mockReturnValue(() => {}),
    },
    daemon: {
      add: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      statuses: vi.fn().mockResolvedValue([]),
      onStatusChanged: vi.fn().mockReturnValue(() => {}),
      onConnected: vi.fn().mockReturnValue(() => {}),
      pair: vi.fn().mockResolvedValue(undefined),
      submitCode: vi.fn().mockResolvedValue(undefined),
      onPairChallenge: vi.fn().mockReturnValue(() => {}),
      onPairSuccess: vi.fn().mockReturnValue(() => {}),
      onPairFailed: vi.fn().mockReturnValue(() => {}),
    },
    preferences: {
      load: vi.fn().mockResolvedValue({}),
      save: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue({}),
      onChanged: vi.fn().mockReturnValue(() => {}),
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

  it('hydrates existing daemon sessions via session.list on mount', async () => {
    (window as any).switchboard.session.list = vi.fn().mockResolvedValue([
      { id: 'vm:abc', name: 'tick-loop', status: 'working', cwd: '/home/x', command: 'bash' },
    ]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('session-tab-vm:abc')).toBeInTheDocument();
    });
  });

  it('deduplicates sessions across list-hydration and create-broadcast', async () => {
    const session = { id: 'vm:abc', name: 'shared', status: 'working', cwd: '/home/x', command: 'bash' };
    let createdHandler: ((s: any) => void) | null = null;
    (window as any).switchboard.session.list = vi.fn().mockResolvedValue([session]);
    (window as any).switchboard.session.onSessionCreated = vi.fn().mockImplementation((cb: any) => {
      createdHandler = cb;
      return () => {};
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('session-tab-vm:abc')).toBeInTheDocument();
    });
    createdHandler?.(session);
    expect(screen.getAllByTestId('session-tab-vm:abc')).toHaveLength(1);
  });
});
