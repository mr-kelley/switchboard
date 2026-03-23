import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SessionTab from '../../src/renderer/components/SessionTab';
import type { SessionInfo } from '../../src/shared/types';

const baseSession: SessionInfo = {
  id: 'test-id',
  name: 'my-project',
  cwd: '/tmp',
  command: '/bin/bash',
  pid: 123,
  status: 'working',
};

describe('SessionTab', () => {
  it('renders session name', () => {
    render(<SessionTab session={baseSession} isActive={false} onSelect={vi.fn()} />);
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('renders green dot for working status', () => {
    render(<SessionTab session={baseSession} isActive={false} onSelect={vi.fn()} />);
    const dot = screen.getByTestId('status-dot-test-id');
    expect(dot.style.backgroundColor).toBe('rgb(166, 227, 161)'); // #a6e3a1
  });

  it('renders yellow dot for idle status', () => {
    const session = { ...baseSession, status: 'idle' as const };
    render(<SessionTab session={session} isActive={false} onSelect={vi.fn()} />);
    const dot = screen.getByTestId('status-dot-test-id');
    expect(dot.style.backgroundColor).toBe('rgb(249, 226, 175)'); // #f9e2af
  });

  it('renders red dot for needs-attention status', () => {
    const session = { ...baseSession, status: 'needs-attention' as const };
    render(<SessionTab session={session} isActive={false} onSelect={vi.fn()} />);
    const dot = screen.getByTestId('status-dot-test-id');
    expect(dot.style.backgroundColor).toBe('rgb(243, 139, 168)'); // #f38ba8
  });

  it('has pulse animation for needs-attention', () => {
    const session = { ...baseSession, status: 'needs-attention' as const };
    render(<SessionTab session={session} isActive={false} onSelect={vi.fn()} />);
    const dot = screen.getByTestId('status-dot-test-id');
    expect(dot.style.animation).toContain('pulse');
  });

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(<SessionTab session={baseSession} isActive={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('session-tab-test-id'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('has highlighted background when active', () => {
    render(<SessionTab session={baseSession} isActive={true} onSelect={vi.fn()} />);
    const tab = screen.getByTestId('session-tab-test-id');
    expect(tab.style.backgroundColor).toBe('rgb(49, 50, 68)'); // #313244
  });
});
