import React, { useEffect, useState } from 'react';
import { usePreferences } from '../state/preferences';
import { useSessions } from '../state/sessions';

export default function StatusBar(): React.ReactElement {
  const { prefs } = usePreferences();
  const { state } = useSessions();
  const { uiColors } = prefs;

  const [daemons, setDaemons] = useState<Array<{ id: string; status: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      window.switchboard.daemon.statuses().then((s) => {
        if (!cancelled) setDaemons(s.map((d) => ({ id: d.id, status: d.status })));
      });
    };
    refresh();
    const offStatus = window.switchboard.daemon.onStatusChanged(() => refresh());
    const offConnected = window.switchboard.daemon.onConnected(() => refresh());
    return () => {
      cancelled = true;
      offStatus();
      offConnected();
    };
  }, []);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId);
  const sessionCount = state.sessions.length;
  const unreadCount = state.unreadSessions.size;
  const connectedDaemons = daemons.filter((d) => d.status === 'connected').length;
  const totalDaemons = daemons.length;

  return (
    <div
      data-testid="status-bar"
      style={{
        height: 24,
        minHeight: 24,
        backgroundColor: uiColors.headerBg,
        borderTop: `1px solid ${uiColors.headerBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: '0.85em',
        color: uiColors.appTextFaint,
      }}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {activeSession && (
          <>
            <span>{activeSession.name}</span>
            <span>{activeSession.cwd}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {totalDaemons > 0 && (
          <span data-testid="daemon-count">
            {connectedDaemons}/{totalDaemons} daemon{totalDaemons !== 1 ? 's' : ''}
          </span>
        )}
        <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
        {unreadCount > 0 && (
          <span style={{ color: uiColors.accentPrimary }}>
            {unreadCount} unread
          </span>
        )}
        <span>Ctrl+N new | Ctrl+B sidebar | Ctrl+, prefs</span>
      </div>
    </div>
  );
}
