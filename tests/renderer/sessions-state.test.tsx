import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SessionsProvider, useSessions } from '../../src/renderer/state/sessions';
import type { SessionInfo } from '../../src/shared/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionsProvider>{children}</SessionsProvider>
);

const makeSession = (id: string, name: string): SessionInfo => ({
  id, name, cwd: '/tmp', command: '/bin/bash', pid: 123, status: 'working',
});

describe('useSessions', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    expect(result.current.state.sessions).toHaveLength(0);
    expect(result.current.state.activeSessionId).toBeNull();
  });

  it('addSession adds a session and sets it active', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => result.current.addSession(makeSession('1', 'test')));

    expect(result.current.state.sessions).toHaveLength(1);
    expect(result.current.state.activeSessionId).toBe('1');
  });

  it('removeSession removes and switches active', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => {
      result.current.addSession(makeSession('1', 'first'));
      result.current.addSession(makeSession('2', 'second'));
    });
    act(() => result.current.removeSession('2'));

    expect(result.current.state.sessions).toHaveLength(1);
    expect(result.current.state.activeSessionId).toBe('1');
  });

  it('removeSession clears active when last session removed', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => result.current.addSession(makeSession('1', 'only')));
    act(() => result.current.removeSession('1'));

    expect(result.current.state.sessions).toHaveLength(0);
    expect(result.current.state.activeSessionId).toBeNull();
  });

  it('setActiveSession changes active', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => {
      result.current.addSession(makeSession('1', 'first'));
      result.current.addSession(makeSession('2', 'second'));
    });
    act(() => result.current.setActiveSession('1'));

    expect(result.current.state.activeSessionId).toBe('1');
  });

  it('updateSessionStatus updates status', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => result.current.addSession(makeSession('1', 'test')));
    act(() => result.current.updateSessionStatus('1', 'needs-attention'));

    expect(result.current.state.sessions[0].status).toBe('needs-attention');
  });

  it('updateSessionName updates name', () => {
    const { result } = renderHook(() => useSessions(), { wrapper });
    act(() => result.current.addSession(makeSession('1', 'old-name')));
    act(() => result.current.updateSessionName('1', 'new-name'));

    expect(result.current.state.sessions[0].name).toBe('new-name');
  });
});
