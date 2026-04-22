import React from 'react';
import type { SessionInfo } from '../../shared/types';
import { usePreferences } from '../state/preferences';

interface SessionTabProps {
  session: SessionInfo;
  isActive: boolean;
  hasUnread?: boolean;
  hasQueuedPrompt?: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export default function SessionTab({ session, isActive, hasUnread, hasQueuedPrompt, onSelect, onContextMenu }: SessionTabProps): React.ReactElement {
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
        fontSize: 'inherit',
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
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {session.name}
      </span>
      {hasQueuedPrompt && (
        <span
          data-testid={`queued-indicator-${session.id}`}
          title="A prompt is queued for this session"
          style={{
            fontSize: 11,
            color: uiColors.accentPrimary,
            flexShrink: 0,
          }}
        >
          ✎
        </span>
      )}
      {hasUnread && !isActive && (
        <span
          data-testid={`unread-badge-${session.id}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: uiColors.accentPrimary,
            flexShrink: 0,
          }}
        />
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </button>
  );
}
