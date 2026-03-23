import React, { useState, useCallback } from 'react';
import { useSessions } from '../state/sessions';
import SessionTab from './SessionTab';
import ContextMenu from './ContextMenu';

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export default function Sidebar(): React.ReactElement {
  const { state, setActiveSession, removeSession, updateSessionName } = useSessions();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(() => {
    if (!contextMenu) return;
    const session = state.sessions.find((s) => s.id === contextMenu.sessionId);
    if (!session) return;
    const newName = prompt('Rename session:', session.name);
    if (newName && newName.trim()) {
      updateSessionName(contextMenu.sessionId, newName.trim());
    }
  }, [contextMenu, state.sessions, updateSessionName]);

  const handleClose = useCallback(() => {
    if (!contextMenu) return;
    try {
      window.switchboard.pty.close(contextMenu.sessionId);
    } catch {
      // PTY might already be dead
    }
    removeSession(contextMenu.sessionId);
  }, [contextMenu, removeSession]);

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
              onContextMenu={(e) => handleContextMenu(session.id, e)}
            />
          ))
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Rename', action: handleRename },
            { label: 'Close Session', action: handleClose },
          ]}
        />
      )}
    </div>
  );
}
