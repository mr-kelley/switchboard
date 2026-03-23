import React from 'react';

interface HeaderProps {
  activeSessionName: string | null;
  onNewSession: () => void;
}

export default function Header({ activeSessionName, onNewSession }: HeaderProps): React.ReactElement {
  return (
    <div
      data-testid="header"
      style={{
        height: 44,
        minHeight: 44,
        backgroundColor: '#1e1e2e',
        borderBottom: '1px solid #313244',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>
        {activeSessionName || 'Switchboard'}
      </span>
      <button
        data-testid="new-session-button"
        onClick={onNewSession}
        style={{
          backgroundColor: '#45475a',
          color: '#cdd6f4',
          border: 'none',
          borderRadius: 4,
          padding: '6px 12px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + New Session
      </button>
    </div>
  );
}
