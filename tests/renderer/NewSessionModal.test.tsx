import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockUsePreferences, mockPrefs } from '../helpers/mock-preferences';

vi.mock('../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import NewSessionModal from '../../src/renderer/components/NewSessionModal';

beforeEach(() => {
  (window as any).switchboard = {
    pty: {
      spawn: vi.fn().mockResolvedValue({
        id: 'new-id', name: 'test', cwd: '/tmp', command: 'claude', pid: 1, status: 'working',
      }),
    },
    daemon: {
      statuses: vi.fn().mockResolvedValue([]),
    },
  };
  (mockPrefs as any).sessionTemplates = [];
  mockUsePreferences.updatePrefs.mockClear();
  if (!('randomUUID' in (globalThis.crypto ?? {}))) {
    (globalThis as any).crypto = { ...(globalThis.crypto ?? {}), randomUUID: () => 'uuid-test' };
  }
});

describe('NewSessionModal', () => {
  it('renders form fields when open', () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    expect(screen.getByTestId('input-name')).toBeInTheDocument();
    expect(screen.getByTestId('input-cwd')).toBeInTheDocument();
    expect(screen.getByTestId('input-command')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<NewSessionModal isOpen={false} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    expect(screen.queryByTestId('new-session-modal')).not.toBeInTheDocument();
  });

  it('shows error for empty name', () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('input-cwd'), { target: { value: '/tmp' } });
    fireEvent.click(screen.getByTestId('submit-session'));
    expect(screen.getByTestId('modal-error')).toHaveTextContent('Project name is required');
  });

  it('shows error for empty directory', () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'test' } });
    fireEvent.click(screen.getByTestId('submit-session'));
    expect(screen.getByTestId('modal-error')).toHaveTextContent('Working directory is required');
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<NewSessionModal isOpen={true} onClose={onClose} onSessionCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has default command value of claude', () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    expect(screen.getByTestId('input-command')).toHaveValue('claude');
  });

  it('renders template controls', () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    expect(screen.getByTestId('template-select')).toBeInTheDocument();
    expect(screen.getByTestId('manage-templates')).toBeInTheDocument();
    expect(screen.getByTestId('save-as-template')).toBeInTheDocument();
  });

  it('prefills the form from a selected template', () => {
    (mockPrefs as any).sessionTemplates = [
      { id: 't1', name: 'Dev', daemonId: '', cwd: '/home/dev', command: 'vim' },
    ];
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('template-select'), { target: { value: 't1' } });
    expect(screen.getByTestId('input-name')).toHaveValue('Dev');
    expect(screen.getByTestId('input-cwd')).toHaveValue('/home/dev');
    expect(screen.getByTestId('input-command')).toHaveValue('vim');
  });

  it('persists a new template when "save as template" is checked on submit', async () => {
    render(<NewSessionModal isOpen={true} onClose={vi.fn()} onSessionCreated={vi.fn()} />);
    fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'myproj' } });
    fireEvent.change(screen.getByTestId('input-cwd'), { target: { value: '/work' } });
    fireEvent.click(screen.getByTestId('save-as-template'));
    fireEvent.click(screen.getByTestId('submit-session'));
    await waitFor(() => expect(mockUsePreferences.updatePrefs).toHaveBeenCalled());
    const arg = mockUsePreferences.updatePrefs.mock.calls.at(-1)![0];
    expect(arg.sessionTemplates).toHaveLength(1);
    expect(arg.sessionTemplates[0]).toMatchObject({ name: 'myproj', cwd: '/work' });
  });
});
