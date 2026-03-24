import React, { useState, useCallback } from 'react';
import { DndContext, closestCenter, DragEndEvent, Modifier } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useSessions } from '../state/sessions';
import { usePreferences } from '../state/preferences';
import SortableSessionTab from './SortableSessionTab';
import ContextMenu from './ContextMenu';

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export default function Sidebar(): React.ReactElement {
  const { state, setActiveSession, removeSession, updateSessionName, reorderSessions } = useSessions();
  const { prefs, updatePrefs } = usePreferences();
  const { uiColors } = prefs;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleContextMenu = useCallback((sessionId: string, e: React.MouseEvent) => {
    if (isDragging) return;
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, [isDragging]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = state.sessions.findIndex((s) => s.id === active.id);
    const newIndex = state.sessions.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(state.sessions, oldIndex, newIndex);
    const orderedIds = newOrder.map((s) => s.id);
    reorderSessions(orderedIds);
    updatePrefs({ sessionOrder: orderedIds });
  }, [state.sessions, reorderSessions, updatePrefs]);

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
        backgroundColor: uiColors.sidebarBg,
        borderRight: `1px solid ${uiColors.sidebarBorder}`,
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
          color: uiColors.sidebarHeaderText,
        }}
      >
        Sessions
      </div>
      <div style={{ flex: 1, padding: '0 6px', overflowY: 'auto' }}>
        {state.sessions.length === 0 ? (
          <div style={{ padding: '0 8px', fontSize: 13, color: uiColors.appTextFaint }}>
            No sessions yet
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setIsDragging(false)}
          >
            <SortableContext
              items={state.sessions.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {state.sessions.map((session) => (
                <SortableSessionTab
                  key={session.id}
                  session={session}
                  isActive={session.id === state.activeSessionId}
                  onSelect={() => setActiveSession(session.id)}
                  onContextMenu={(e) => handleContextMenu(session.id, e)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'Rename', action: handleRename },
            { label: 'Close Session', action: handleClose, shortcut: 'Ctrl+W' },
          ]}
        />
      )}
    </div>
  );
}
