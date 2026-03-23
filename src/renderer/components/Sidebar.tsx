import React from 'react';
import { useSessions } from '../state/sessions';
import SessionTab from './SessionTab';

export default function Sidebar(): React.ReactElement {
  const { state, setActiveSession } = useSessions();

  return (
    <div
      data-testid="sidebar"
      style={{
        width: 220,
        minWidth: 220,
        backgroundColor: '#252536',
        borderRight: '1px solid #313244',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '16px 14px 12px',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#a6adc8',
        }}
      >
        Sessions
      </div>
      <div style={{ flex: 1, padding: '0 6px', overflowY: 'auto' }}>
        {state.sessions.length === 0 ? (
          <div style={{ padding: '0 8px', fontSize: 13, color: '#6c7086' }}>
            No sessions yet
          </div>
        ) : (
          state.sessions.map((session) => (
            <SessionTab
              key={session.id}
              session={session}
              isActive={session.id === state.activeSessionId}
              onSelect={() => setActiveSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
