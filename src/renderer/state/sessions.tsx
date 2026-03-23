import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { SessionInfo, SessionStatus } from '../../shared/types';

interface SessionsState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
}

type SessionsAction =
  | { type: 'ADD_SESSION'; session: SessionInfo }
  | { type: 'REMOVE_SESSION'; id: string }
  | { type: 'SET_ACTIVE'; id: string }
  | { type: 'UPDATE_STATUS'; id: string; status: SessionStatus }
  | { type: 'UPDATE_NAME'; id: string; name: string };

function sessionsReducer(state: SessionsState, action: SessionsAction): SessionsState {
  switch (action.type) {
    case 'ADD_SESSION':
      return {
        sessions: [...state.sessions, action.session],
        activeSessionId: action.session.id,
      };
    case 'REMOVE_SESSION': {
      const remaining = state.sessions.filter((s) => s.id !== action.id);
      let activeId = state.activeSessionId;
      if (activeId === action.id) {
        activeId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }
      return { sessions: remaining, activeSessionId: activeId };
    }
    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.id };
    case 'UPDATE_STATUS':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, status: action.status } : s
        ),
      };
    case 'UPDATE_NAME':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, name: action.name } : s
        ),
      };
    default:
      return state;
  }
}

interface SessionsContextValue {
  state: SessionsState;
  addSession: (session: SessionInfo) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSessionStatus: (id: string, status: SessionStatus) => void;
  updateSessionName: (id: string, name: string) => void;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(sessionsReducer, {
    sessions: [],
    activeSessionId: null,
  });

  const addSession = useCallback((session: SessionInfo) => {
    dispatch({ type: 'ADD_SESSION', session });
  }, []);

  const removeSession = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SESSION', id });
  }, []);

  const setActiveSession = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE', id });
  }, []);

  const updateSessionStatus = useCallback((id: string, status: SessionStatus) => {
    dispatch({ type: 'UPDATE_STATUS', id, status });
  }, []);

  const updateSessionName = useCallback((id: string, name: string) => {
    dispatch({ type: 'UPDATE_NAME', id, name });
  }, []);

  return (
    <SessionsContext.Provider value={{ state, addSession, removeSession, setActiveSession, updateSessionStatus, updateSessionName }}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions(): SessionsContextValue {
  const context = useContext(SessionsContext);
  if (!context) {
    throw new Error('useSessions must be used within a SessionsProvider');
  }
  return context;
}
