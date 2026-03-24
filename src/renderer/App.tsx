import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SessionsProvider, useSessions } from './state/sessions';
import { PreferencesProvider, usePreferences } from './state/preferences';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TerminalPane from './components/TerminalPane';
import NewSessionModal from './components/NewSessionModal';

function AppContent(): React.ReactElement {
  const { state, addSession, removeSession, setActiveSession, updateSessionStatus } = useSessions();
  const { prefs, updatePrefs } = usePreferences();
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) || null;

  // Listen for PTY exit events and remove sessions
  useEffect(() => {
    const unsubExit = window.switchboard.pty.onExit((sessionId: string) => {
      removeSession(sessionId);
    });
    return unsubExit;
  }, [removeSession]);

  // Listen for session status changes from idle detector
  useEffect(() => {
    const unsubStatus = window.switchboard.session.onStatusChanged((sessionId, status) => {
      updateSessionStatus(sessionId, status as import('../shared/types').SessionStatus);
    });
    return unsubStatus;
  }, [updateSessionStatus]);

  const selectSessionByIndex = useCallback((index: number) => {
    if (index < state.sessions.length) {
      setActiveSession(state.sessions[index].id);
    }
  }, [state.sessions, setActiveSession]);

  const cycleSession = useCallback((direction: 1 | -1) => {
    if (state.sessions.length === 0) return;
    const currentIndex = state.sessions.findIndex((s) => s.id === state.activeSessionId);
    const nextIndex = (currentIndex + direction + state.sessions.length) % state.sessions.length;
    setActiveSession(state.sessions[nextIndex].id);
  }, [state.sessions, state.activeSessionId, setActiveSession]);

  const closeActiveSession = useCallback(() => {
    if (!state.activeSessionId) return;
    try {
      window.switchboard.pty.close(state.activeSessionId);
    } catch {
      // PTY might already be dead
    }
    removeSession(state.activeSessionId);
  }, [state.activeSessionId, removeSession]);

  const shortcutHandlers = useMemo(() => ({
    'session:new': () => setModalOpen(true),
    'session:close': closeActiveSession,
    'session:next': () => cycleSession(1),
    'session:prev': () => cycleSession(-1),
    'session:1': () => selectSessionByIndex(0),
    'session:2': () => selectSessionByIndex(1),
    'session:3': () => selectSessionByIndex(2),
    'session:4': () => selectSessionByIndex(3),
    'session:5': () => selectSessionByIndex(4),
    'session:6': () => selectSessionByIndex(5),
    'session:7': () => selectSessionByIndex(6),
    'session:8': () => selectSessionByIndex(7),
    'session:9': () => selectSessionByIndex(8),
    'app:toggle-sidebar': () => setSidebarVisible((v) => !v),
    'app:preferences': () => { /* placeholder — PreferencesModal in Sprint 10 */ },
    'terminal:zoom-in': () => updatePrefs({ terminalFontSize: Math.min(32, prefs.terminalFontSize + 1) }),
    'terminal:zoom-out': () => updatePrefs({ terminalFontSize: Math.max(8, prefs.terminalFontSize - 1) }),
    'terminal:zoom-reset': () => updatePrefs({ terminalFontSize: 14 }),
  }), [closeActiveSession, cycleSession, selectSessionByIndex, prefs.terminalFontSize, updatePrefs]);

  useKeyboardShortcuts(prefs.shortcuts, shortcutHandlers);

  return (
    <div
      data-testid="app-container"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
      }}
    >
      {sidebarVisible && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          activeSessionName={activeSession?.name || null}
          onNewSession={() => setModalOpen(true)}
        />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {state.sessions.length === 0 ? (
            <div
              data-testid="terminal-area"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#6c7086',
                fontSize: 14,
              }}
            >
              Press "+ New Session" to get started
            </div>
          ) : (
            state.sessions.map((session) => (
              <TerminalPane
                key={session.id}
                sessionId={session.id}
                visible={session.id === state.activeSessionId}
              />
            ))
          )}
        </div>
      </div>
      <NewSessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSessionCreated={(session) => addSession(session)}
      />
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <PreferencesProvider>
      <SessionsProvider>
        <AppContent />
      </SessionsProvider>
    </PreferencesProvider>
  );
}
