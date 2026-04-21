import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockUsePreferences } from '../../helpers/mock-preferences';

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockState = {
  sessions: [
    { id: '1', name: 'project-a', cwd: '/tmp/a', command: 'claude', pid: 1, status: 'working' as const },
  ],
  activeSessionId: '1',
  unreadSessions: new Set<string>(),
};

vi.mock('../../../src/renderer/state/sessions', () => ({
  useSessions: () => ({ state: mockState }),
  SessionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  (window as any).switchboard = {
    daemon: {
      statuses: vi.fn().mockResolvedValue([]),
      onStatusChanged: vi.fn().mockReturnValue(() => {}),
      onConnected: vi.fn().mockReturnValue(() => {}),
    },
  };
});

import StatusBar from '../../../src/renderer/components/StatusBar';

describe('StatusBar', () => {
  it('renders status bar', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('shows session count', () => {
    render(<StatusBar />);
    expect(screen.getByText('1 session')).toBeInTheDocument();
  });

  it('shows active session name', () => {
    render(<StatusBar />);
    expect(screen.getByText('project-a')).toBeInTheDocument();
  });

  it('shows shortcut hints', () => {
    render(<StatusBar />);
    expect(screen.getByText(/Ctrl\+N/)).toBeInTheDocument();
  });

  it('shows daemon count when daemons are configured', async () => {
    (window as any).switchboard.daemon.statuses.mockResolvedValue([
      { id: 'localhost', name: 'Localhost', status: 'connected', sessionCount: 1 },
      { id: 'vm', name: 'VM', status: 'disconnected', sessionCount: 0 },
    ]);
    render(<StatusBar />);
    await waitFor(() => expect(screen.getByTestId('daemon-count')).toHaveTextContent('1/2 daemons'));
  });

  it('hides daemon count when no daemons configured', () => {
    render(<StatusBar />);
    expect(screen.queryByTestId('daemon-count')).not.toBeInTheDocument();
  });
});
