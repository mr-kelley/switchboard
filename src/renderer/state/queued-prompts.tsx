import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';

interface QueuedPromptsState {
  queued: Record<string, string>;
  lastRejection: { sessionId: string; reason: string } | null;
}

type Action =
  | { type: 'SET'; sessionId: string; text: string }
  | { type: 'CLEAR'; sessionId: string }
  | { type: 'SYNC'; queued: Record<string, string> }
  | { type: 'REJECT'; sessionId: string; reason: string }
  | { type: 'CLEAR_REJECTION' };

function reducer(state: QueuedPromptsState, action: Action): QueuedPromptsState {
  switch (action.type) {
    case 'SET':
      return { ...state, queued: { ...state.queued, [action.sessionId]: action.text } };
    case 'CLEAR': {
      if (!(action.sessionId in state.queued)) return state;
      const next = { ...state.queued };
      delete next[action.sessionId];
      return { ...state, queued: next };
    }
    case 'SYNC':
      return { ...state, queued: { ...action.queued } };
    case 'REJECT':
      return { ...state, lastRejection: { sessionId: action.sessionId, reason: action.reason } };
    case 'CLEAR_REJECTION':
      return { ...state, lastRejection: null };
    default:
      return state;
  }
}

interface QueuedPromptsContextValue {
  state: QueuedPromptsState;
  queue: (sessionId: string, text: string) => Promise<void>;
  clear: (sessionId: string) => Promise<void>;
  clearRejection: () => void;
  has: (sessionId: string) => boolean;
}

const QueuedPromptsContext = createContext<QueuedPromptsContextValue | null>(null);

export function QueuedPromptsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, { queued: {}, lastRejection: null });

  useEffect(() => {
    const offUpdated = window.switchboard.session.onQueueUpdated((sessionId, text) => {
      if (text === null) dispatch({ type: 'CLEAR', sessionId });
      else dispatch({ type: 'SET', sessionId, text });
    });
    const offRejected = window.switchboard.session.onQueueRejected((sessionId, reason) => {
      dispatch({ type: 'REJECT', sessionId, reason });
    });
    const offSync = window.switchboard.session.onQueueSync((queued) => {
      dispatch({ type: 'SYNC', queued });
    });
    return () => {
      offUpdated();
      offRejected();
      offSync();
    };
  }, []);

  const queue = useCallback(async (sessionId: string, text: string) => {
    await window.switchboard.session.queuePrompt(sessionId, text);
  }, []);

  const clear = useCallback(async (sessionId: string) => {
    await window.switchboard.session.clearQueue(sessionId);
  }, []);

  const clearRejection = useCallback(() => {
    dispatch({ type: 'CLEAR_REJECTION' });
  }, []);

  const has = useCallback((sessionId: string): boolean => {
    return sessionId in state.queued;
  }, [state.queued]);

  return (
    <QueuedPromptsContext.Provider value={{ state, queue, clear, clearRejection, has }}>
      {children}
    </QueuedPromptsContext.Provider>
  );
}

export function useQueuedPrompts(): QueuedPromptsContextValue {
  const context = useContext(QueuedPromptsContext);
  if (!context) {
    throw new Error('useQueuedPrompts must be used within a QueuedPromptsProvider');
  }
  return context;
}
