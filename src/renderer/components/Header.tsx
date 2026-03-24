import React from 'react';
import { usePreferences } from '../state/preferences';

interface HeaderProps {
  activeSessionName: string | null;
  onNewSession: () => void;
  onOpenPreferences?: () => void;
}

export default function Header({ activeSessionName, onNewSession, onOpenPreferences }: HeaderProps): React.ReactElement {
  const { prefs } = usePreferences();
  const { uiColors } = prefs;

  return (
    <div
      data-testid="header"
      style={{
        height: 44,
        minHeight: 44,
        backgroundColor: uiColors.headerBg,
        borderBottom: `1px solid ${uiColors.headerBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: uiColors.headerText }}>
        {activeSessionName || 'Switchboard'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {onOpenPreferences && (
          <button
            data-testid="preferences-button"
            onClick={onOpenPreferences}
            title="Preferences (Ctrl+,)"
            style={{
              backgroundColor: uiColors.buttonBg,
              color: uiColors.buttonText,
              border: 'none',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            &#9881;
          </button>
        )}
        <button
          data-testid="new-session-button"
          onClick={onNewSession}
          title="New Session (Ctrl+N)"
          style={{
            backgroundColor: uiColors.buttonBg,
            color: uiColors.buttonText,
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
    </div>
  );
}
