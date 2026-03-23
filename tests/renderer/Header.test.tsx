import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Header from '../../src/renderer/components/Header';

describe('Header', () => {
  it('shows session name when provided', () => {
    render(<Header activeSessionName="my-project" onNewSession={vi.fn()} />);
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('shows Switchboard when no active session', () => {
    render(<Header activeSessionName={null} onNewSession={vi.fn()} />);
    expect(screen.getByText('Switchboard')).toBeInTheDocument();
  });

  it('button triggers callback on click', () => {
    const onNewSession = vi.fn();
    render(<Header activeSessionName={null} onNewSession={onNewSession} />);
    fireEvent.click(screen.getByTestId('new-session-button'));
    expect(onNewSession).toHaveBeenCalledOnce();
  });
});
