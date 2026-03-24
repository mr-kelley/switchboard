import React from 'react';
import type { SessionInfo } from '../../shared/types';
import { usePreferences } from '../state/preferences';

interface SessionTabProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export default function SessionTab({ session, isActive, onSelect, onContextMenu }: SessionTabProps): React.ReactElement {
  const { prefs } = usePreferences();
  const { uiColors } = prefs;

  const statusColors: Record<string, string> = {
    working: uiColors.statusWorking,
    idle: uiColors.statusIdle,
    'needs-attention': uiColors.statusNeedsAttention,
  };

  const dotColor = statusColors[session.status] || uiColors.statusDefault;
  const needsAttention = session.status === 'needs-attention';

  return (
    <button
      data-testid={`session-tab-${session.id}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        border: 'none',
        borderRadius: 6,
        backgroundColor: isActive ? uiColors.tabActiveBg : 'transparent',
        color: isActive ? uiColors.tabActiveText : uiColors.tabInactiveText,
        cursor: 'pointer',
        fontSize: 13,
        textAlign: 'left',
        transition: 'background-color 0.15s',
      }}
    >
      <span
        data-testid={`status-dot-${session.id}`}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
          animation: needsAttention ? 'pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.name}
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </button>
  );
}
