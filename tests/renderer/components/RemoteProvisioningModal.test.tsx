import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockUsePreferences } from '../../helpers/mock-preferences';

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import RemoteProvisioningModal from '../../../src/renderer/components/RemoteProvisioningModal';

let progressCb: ((state: unknown) => void) | null = null;

beforeEach(() => {
  progressCb = null;
  (window as any).switchboard = {
    platform: 'linux',
    remoteProvision: {
      start: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      retryFrom: vi.fn().mockResolvedValue(undefined),
      onProgress: vi.fn((cb: (state: unknown) => void) => {
        progressCb = cb;
        return () => { progressCb = null; };
      }),
    },
  };
});

describe('RemoteProvisioningModal', () => {
  it('renders form fields when open', () => {
    render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('input-host')).toBeInTheDocument();
    expect(screen.getByTestId('input-user')).toBeInTheDocument();
    expect(screen.getByTestId('input-port')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<RemoteProvisioningModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('remote-provisioning-modal')).not.toBeInTheDocument();
  });

  function fillMinimum(): void {
    fireEvent.change(screen.getByTestId('input-host'), { target: { value: 'srv.example' } });
    fireEvent.change(screen.getByTestId('input-user'), { target: { value: 'ubuntu' } });
    fireEvent.change(screen.getByTestId('input-server-cert'), { target: { value: '/certs/server.crt' } });
    fireEvent.change(screen.getByTestId('input-server-key'), { target: { value: '/certs/server.key' } });
    fireEvent.change(screen.getByTestId('input-ca-cert'), { target: { value: '/certs/ca.crt' } });
  }

  it('rejects submit with empty host', () => {
    render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('input-user'), { target: { value: 'ubuntu' } });
    fireEvent.click(screen.getByTestId('submit-provision'));
    expect(screen.getByTestId('modal-error')).toHaveTextContent(/Host and user are required/);
  });

  it('rejects submit with missing cert paths', () => {
    render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('input-host'), { target: { value: 'srv.example' } });
    fireEvent.change(screen.getByTestId('input-user'), { target: { value: 'ubuntu' } });
    fireEvent.click(screen.getByTestId('submit-provision'));
    expect(screen.getByTestId('modal-error')).toHaveTextContent(/cert.*required/i);
  });

  it('calls start with the entered target and cert bundle', async () => {
    render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    fillMinimum();
    fireEvent.change(screen.getByTestId('input-port'), { target: { value: '2222' } });
    fireEvent.click(screen.getByTestId('submit-provision'));
    await waitFor(() => {
      expect((window as any).switchboard.remoteProvision.start).toHaveBeenCalledWith({
        target: { host: 'srv.example', user: 'ubuntu', port: 2222, identityFile: undefined },
        daemonName: undefined,
        daemonPort: 3717,
        certs: {
          serverCertPath: '/certs/server.crt',
          serverKeyPath: '/certs/server.key',
          caCertPath: '/certs/ca.crt',
        },
      });
    });
  });

  it('renders step list when progress arrives', async () => {
    const { rerender } = render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    fillMinimum();
    fireEvent.click(screen.getByTestId('submit-provision'));
    await waitFor(() => expect(progressCb).not.toBeNull());
    progressCb!([
      { id: 'test-connection', label: 'Test SSH', status: 'done', message: 'connected' },
      { id: 'probe-target', label: 'Probe', status: 'active' },
      { id: 'extract', label: 'Extract', status: 'pending' },
    ]);
    rerender(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('step-test-connection')).toBeInTheDocument();
      expect(screen.getByTestId('step-probe-target')).toBeInTheDocument();
    });
  });

  it('shows Retry button on failure and calls retryFrom', async () => {
    (window as any).switchboard.remoteProvision.start = vi.fn().mockRejectedValue(new Error('boom'));
    render(<RemoteProvisioningModal isOpen={true} onClose={vi.fn()} />);
    fillMinimum();
    fireEvent.click(screen.getByTestId('submit-provision'));
    await waitFor(() => expect(progressCb).not.toBeNull());
    progressCb!([
      { id: 'test-connection', label: 'Test SSH', status: 'failed', errorKind: 'auth-failed', errorDetail: 'Permission denied' },
    ]);
    await waitFor(() => expect(screen.getByTestId('retry-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('retry-button'));
    expect((window as any).switchboard.remoteProvision.retryFrom).toHaveBeenCalledWith('test-connection');
  });
});
