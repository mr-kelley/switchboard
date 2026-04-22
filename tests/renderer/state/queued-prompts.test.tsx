import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueuedPromptsProvider, useQueuedPrompts } from '../../../src/renderer/state/queued-prompts';

let onQueueUpdatedCb: ((sessionId: string, text: string | null) => void) | null = null;
let onQueueRejectedCb: ((sessionId: string, reason: string) => void) | null = null;
let onQueueSyncCb: ((q: Record<string, string>) => void) | null = null;

beforeEach(() => {
  onQueueUpdatedCb = null;
  onQueueRejectedCb = null;
  onQueueSyncCb = null;
  (window as any).switchboard = {
    session: {
      queuePrompt: vi.fn().mockResolvedValue(undefined),
      clearQueue: vi.fn().mockResolvedValue(undefined),
      onQueueUpdated: vi.fn().mockImplementation((cb) => {
        onQueueUpdatedCb = cb;
        return () => { onQueueUpdatedCb = null; };
      }),
      onQueueRejected: vi.fn().mockImplementation((cb) => {
        onQueueRejectedCb = cb;
        return () => { onQueueRejectedCb = null; };
      }),
      onQueueSync: vi.fn().mockImplementation((cb) => {
        onQueueSyncCb = cb;
        return () => { onQueueSyncCb = null; };
      }),
    },
  };
});

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return <QueuedPromptsProvider>{children}</QueuedPromptsProvider>;
}

describe('queued-prompts state (daemon-backed)', () => {
  it('sends queuePrompt via IPC when queue is called', async () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    await act(async () => { await result.current.queue('s1', 'hello'); });
    expect((window as any).switchboard.session.queuePrompt).toHaveBeenCalledWith('s1', 'hello');
  });

  it('sends clearQueue via IPC when clear is called', async () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    await act(async () => { await result.current.clear('s1'); });
    expect((window as any).switchboard.session.clearQueue).toHaveBeenCalledWith('s1');
  });

  it('updates state when onQueueUpdated fires with text', () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    act(() => { onQueueUpdatedCb?.('s1', 'from daemon'); });
    expect(result.current.state.queued['s1']).toBe('from daemon');
    expect(result.current.has('s1')).toBe(true);
  });

  it('clears state when onQueueUpdated fires with null', () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    act(() => { onQueueUpdatedCb?.('s1', 'first'); });
    act(() => { onQueueUpdatedCb?.('s1', null); });
    expect(result.current.has('s1')).toBe(false);
  });

  it('syncs full queue state on onQueueSync', () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    act(() => { onQueueSyncCb?.({ 'd1:s1': 'a', 'd1:s2': 'b' }); });
    expect(result.current.state.queued).toEqual({ 'd1:s1': 'a', 'd1:s2': 'b' });
  });

  it('captures rejection reason for the right session', () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    act(() => { onQueueRejectedCb?.('s1', 'already queued'); });
    expect(result.current.state.lastRejection).toEqual({ sessionId: 's1', reason: 'already queued' });
  });

  it('clearRejection drops the rejection state', () => {
    const { result } = renderHook(() => useQueuedPrompts(), { wrapper });
    act(() => { onQueueRejectedCb?.('s1', 'already queued'); });
    act(() => { result.current.clearRejection(); });
    expect(result.current.state.lastRejection).toBeNull();
  });

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useQueuedPrompts())).toThrow(/QueuedPromptsProvider/);
  });
});
