import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SessionsProvider, useSessions } from './state/sessions';
import { PreferencesProvider, usePreferences } from './state/preferences';
import { QueuedPromptsProvider } from './state/queued-prompts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TerminalPane from './components/TerminalPane';
import NewSessionModal from './components/NewSessionModal';
import PreferencesModal from './components/PreferencesModal';
import StatusBar from './components/StatusBar';

function AppContent(): React.ReactElement {
  const { state, addSession, removeSession, setActiveSession, updateSessionStatus, markUnread } = useSessions();
  const { prefs, updatePrefs } = usePreferences();
  const [modalOpen, setModalOpen] = useState(false);
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [queueBarSessionId, setQueueBarSessionId] = useState<string | null>(null);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) || null;

  // Listen for PTY exit events and remove sessions
  useEffect(() => {
    const unsubExit = window.switchboard.pty.onExit((sessionId: string) => {
      removeSession(sessionId);
    });
    return unsubExit;
  }, [removeSession]);

  // Track active session ID in a ref so the onData callback always sees current value
  const activeSessionIdRef = useRef(state.activeSessionId);
  activeSessionIdRef.current = state.activeSessionId;

  // Grace period after tab switch — ignore output from the tab we just left
  const switchTimestampRef = useRef(0);
  useEffect(() => {
    switchTimestampRef.current = Date.now();
  }, [state.activeSessionId]);

  // Mark background tabs as unread when they receive output
  useEffect(() => {
    const unsubData = window.switchboard.pty.onData((sessionId: string) => {
      // Skip if this is the active session
      if (sessionId === activeSessionIdRef.current) return;
      // Skip output within 200ms of a tab switch (prompt redraw noise)
      if (Date.now() - switchTimestampRef.current < 200) return;
      markUnread(sessionId);
    });
    return unsubData;
  }, [markUnread]);

  // Custom CSS injection
  useEffect(() => {
    if (!prefs.customCssPath) return;
    const style = document.createElement('style');
    style.setAttribute('data-custom-css', 'true');
    fetch(prefs.customCssPath)
      .then((res) => res.text())
      .then((css) => {
        style.textContent = css;
        document.head.appendChild(style);
      })
      .catch(() => {
        // File not found or inaccessible — silently ignore
      });
    return () => {
      style.remove();
    };
  }, [prefs.customCssPath]);

  // Listen for session status changes from idle detector
  // (Queued-prompt firing happens daemon-side; this hook just tracks the UI state.)
  useEffect(() => {
    const unsubStatus = window.switchboard.session.onStatusChanged((sessionId, status) => {
      updateSessionStatus(sessionId, status as import('../shared/types').SessionStatus);
    });
    return unsubStatus;
  }, [updateSessionStatus]);

  // Listen for daemon-created sessions (async spawn via daemon)
  useEffect(() => {
    const unsub = window.switchboard.session.onSessionCreated((session: import('../shared/types').SessionInfo) => {
      addSession(session);
    });
    return unsub;
  }, [addSession]);

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
    'app:preferences': () => setPrefsModalOpen(true),
    'terminal:zoom-in': () => updatePrefs({ terminalFontSize: Math.min(32, prefs.terminalFontSize + 1) }),
    'terminal:zoom-out': () => updatePrefs({ terminalFontSize: Math.max(8, prefs.terminalFontSize - 1) }),
    'terminal:zoom-reset': () => updatePrefs({ terminalFontSize: 14 }),
    'terminal:search': () => setSearchVisible((v) => !v),
    'session:queue': () => {
      if (!state.activeSessionId) return;
      setQueueBarSessionId((prev) => (prev === state.activeSessionId ? null : state.activeSessionId));
    },
  }), [closeActiveSession, cycleSession, selectSessionByIndex, prefs.terminalFontSize, updatePrefs, state.activeSessionId]);

  useKeyboardShortcuts(prefs.shortcuts, shortcutHandlers);

  // Listen for Ctrl+Tab / Ctrl+Shift+Tab forwarded from main process
  useEffect(() => {
    const unsub = window.switchboard.onCycleTab((shift) => {
      cycleSession(shift ? -1 : 1);
    });
    return unsub;
  }, [cycleSession]);

  const { uiColors } = prefs;

  return (
    <div
      data-testid="app-container"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: uiColors.appBg,
        color: uiColors.appText,
        fontFamily: prefs.uiFontFamily,
        fontSize: prefs.uiFontSize,
      }}
    >
      {sidebarVisible && <Sidebar />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          activeSessionName={activeSession?.name || null}
          onNewSession={() => setModalOpen(true)}
          onOpenPreferences={() => setPrefsModalOpen(true)}
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
                color: uiColors.appTextFaint,
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
                searchVisible={searchVisible && session.id === state.activeSessionId}
                onSearchClose={() => setSearchVisible(false)}
                queueBarVisible={queueBarSessionId === session.id}
                onQueueBarClose={() => setQueueBarSessionId(null)}
              />
            ))
          )}
        </div>
        <StatusBar />
      </div>
      <NewSessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSessionCreated={(session) => addSession(session)}
      />
      <PreferencesModal
        isOpen={prefsModalOpen}
        onClose={() => setPrefsModalOpen(false)}
      />
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <PreferencesProvider>
      <SessionsProvider>
        <QueuedPromptsProvider>
          <AppContent />
        </QueuedPromptsProvider>
      </SessionsProvider>
    </PreferencesProvider>
  );
}
