import React from 'react';
import type { SessionInfo } from '../../shared/types';

interface SessionTabProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const STATUS_COLORS: Record<string, string> = {
  working: '#a6e3a1',
  idle: '#f9e2af',
  'needs-attention': '#f38ba8',
};

export default function SessionTab({ session, isActive, onSelect, onContextMenu }: SessionTabProps): React.ReactElement {
  const dotColor = STATUS_COLORS[session.status] || '#6c7086';
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
        backgroundColor: isActive ? '#313244' : 'transparent',
        color: isActive ? '#cdd6f4' : '#a6adc8',
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
