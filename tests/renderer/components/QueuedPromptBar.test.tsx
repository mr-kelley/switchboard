import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockUsePreferences } from '../../helpers/mock-preferences';

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { QueuedPromptsProvider } from '../../../src/renderer/state/queued-prompts';
import QueuedPromptBar from '../../../src/renderer/components/QueuedPromptBar';

let onQueueUpdatedCb: ((sessionId: string, text: string | null) => void) | null = null;

beforeEach(() => {
  onQueueUpdatedCb = null;
  (window as any).switchboard = {
    session: {
      queuePrompt: vi.fn().mockResolvedValue(undefined),
      clearQueue: vi.fn().mockResolvedValue(undefined),
      onQueueUpdated: vi.fn().mockImplementation((cb) => {
        onQueueUpdatedCb = cb;
        return () => { onQueueUpdatedCb = null; };
      }),
      onQueueRejected: vi.fn().mockReturnValue(() => {}),
      onQueueSync: vi.fn().mockReturnValue(() => {}),
    },
  };
});

function renderBar(sessionId: string, onClose = vi.fn()) {
  return render(
    <QueuedPromptsProvider>
      <QueuedPromptBar sessionId={sessionId} onClose={onClose} />
    </QueuedPromptsProvider>
  );
}

describe('QueuedPromptBar (daemon-backed)', () => {
  it('renders input when queue is empty', () => {
    renderBar('s1');
    expect(screen.getByTestId('queued-prompt-input-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('queued-prompt-display-s1')).not.toBeInTheDocument();
  });

  it('calls queuePrompt via IPC on submit', () => {
    const onClose = vi.fn();
    renderBar('s1', onClose);
    const input = screen.getByTestId('queued-prompt-input-s1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'run tests' } });
    fireEvent.click(screen.getByTestId('queued-prompt-submit-s1'));
    expect((window as any).switchboard.session.queuePrompt).toHaveBeenCalledWith('s1', 'run tests');
    expect(onClose).toHaveBeenCalled();
  });

  it('submits on Enter', () => {
    renderBar('s1');
    const input = screen.getByTestId('queued-prompt-input-s1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lint' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((window as any).switchboard.session.queuePrompt).toHaveBeenCalledWith('s1', 'lint');
  });

  it('closes without queuing on Escape', () => {
    const onClose = vi.fn();
    renderBar('s1', onClose);
    const input = screen.getByTestId('queued-prompt-input-s1') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abort' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((window as any).switchboard.session.queuePrompt).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows display + Clear when a prompt is already queued', () => {
    renderBar('s1');
    act(() => { onQueueUpdatedCb?.('s1', 'already-queued'); });
    expect(screen.getByTestId('queued-prompt-display-s1')).toHaveTextContent('already-queued');
    expect(screen.getByTestId('queued-prompt-clear-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('queued-prompt-input-s1')).not.toBeInTheDocument();
  });

  it('Clear button calls clearQueue via IPC', () => {
    renderBar('s1');
    act(() => { onQueueUpdatedCb?.('s1', 'to-clear'); });
    fireEvent.click(screen.getByTestId('queued-prompt-clear-s1'));
    expect((window as any).switchboard.session.clearQueue).toHaveBeenCalledWith('s1');
  });
});
