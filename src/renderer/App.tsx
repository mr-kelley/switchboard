import React, { useState, useEffect } from 'react';
import { SessionsProvider, useSessions } from './state/sessions';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TerminalPane from './components/TerminalPane';
import NewSessionModal from './components/NewSessionModal';

function AppContent(): React.ReactElement {
  const { state, addSession, removeSession } = useSessions();
  const [modalOpen, setModalOpen] = useState(false);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) || null;

  // Listen for PTY exit events and remove sessions
  useEffect(() => {
    const unsubExit = window.switchboard.pty.onExit((sessionId: string) => {
      removeSession(sessionId);
    });
    return unsubExit;
  }, [removeSession]);

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
      <Sidebar />
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
    <SessionsProvider>
      <AppContent />
    </SessionsProvider>
  );
}
