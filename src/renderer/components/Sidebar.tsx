import React, { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCorners,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useSessions } from '../state/sessions';
import { usePreferences } from '../state/preferences';
import { useQueuedPrompts } from '../state/queued-prompts';
import SortableSessionTab from './SortableSessionTab';
import ContextMenu from './ContextMenu';
import type { SessionInfo, SessionGroup } from '../../shared/types';

// ---- Pure grouping helpers (exported for tests) ----

export function daemonIdOf(compositeId: string): string {
  const i = compositeId.indexOf(':');
  return i === -1 ? '' : compositeId.slice(0, i);
}

export function hostGroupKey(daemonId: string): string {
  return `daemon-${daemonId}`;
}

export function isHostGroup(key: string): boolean {
  return key.startsWith('daemon-');
}

export function friendlyDaemonName(daemonId: string): string {
  if (daemonId === 'localhost') return 'Localhost';
  return daemonId || 'Local';
}

export interface ComputedGroup {
  key: string;
  name: string;
  collapsed: boolean;
  sessions: SessionInfo[];
}

/** Group sessions by explicit membership, falling back to host-default groups. */
export function computeGroups(
  sessions: SessionInfo[],
  groups: Record<string, SessionGroup>,
  daemonNames: Record<string, string>,
): ComputedGroup[] {
  const assigned = new Map<string, string>();
  for (const [key, g] of Object.entries(groups)) {
    for (const sid of g.sessionIds) assigned.set(sid, key);
  }

  const order: string[] = [];
  const bucket = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    let key = assigned.get(s.id);
    if (!key || !groups[key]) key = hostGroupKey(daemonIdOf(s.id));
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push(s);
  }

  return order.map((key) => {
    const members = bucket.get(key)!;
    const stored = groups[key]?.sessionIds ?? [];
    const byId = new Map(members.map((m) => [m.id, m]));
    const ordered: SessionInfo[] = [];
    for (const sid of stored) {
      const m = byId.get(sid);
      if (m) {
        ordered.push(m);
        byId.delete(sid);
      }
    }
    for (const m of members) if (byId.has(m.id)) ordered.push(m);
    const name = isHostGroup(key)
      ? daemonNames[key.slice('daemon-'.length)] ?? friendlyDaemonName(key.slice('daemon-'.length))
      : groups[key]?.name ?? 'Group';
    return { key, name, collapsed: groups[key]?.collapsed ?? false, sessions: ordered };
  });
}

/** Move a session into a target group, removing it from any other group. */
export function moveToGroup(
  groups: Record<string, SessionGroup>,
  sessionId: string,
  targetKey: string,
  targetName: string,
): Record<string, SessionGroup> {
  const next: Record<string, SessionGroup> = {};
  for (const [k, g] of Object.entries(groups)) {
    next[k] = { ...g, sessionIds: g.sessionIds.filter((s) => s !== sessionId) };
  }
  const existing = next[targetKey];
  next[targetKey] = {
    name: existing?.name ?? targetName,
    collapsed: existing?.collapsed ?? false,
    sessionIds: [...(existing?.sessionIds ?? []), sessionId],
  };
  return next;
}

/** Toggle the collapsed flag for a group, materializing it if needed. */
export function toggleCollapse(
  groups: Record<string, SessionGroup>,
  key: string,
  name: string,
): Record<string, SessionGroup> {
  const existing = groups[key];
  return {
    ...groups,
    [key]: {
      name: existing?.name ?? name,
      collapsed: !(existing?.collapsed ?? false),
      sessionIds: existing?.sessionIds ?? [],
    },
  };
}

// ---- Component ----

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

function GroupSection({
  group,
  sessionMap,
  activeSessionId,
  unread,
  queued,
  onSelect,
  onContextMenu,
  onToggle,
  uiColors,
}: {
  group: ComputedGroup;
  sessionMap: Map<string, SessionInfo>;
  activeSessionId: string | null;
  unread: Set<string>;
  queued: Record<string, unknown>;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  onToggle: (group: ComputedGroup) => void;
  uiColors: Record<string, string>;
}): React.ReactElement {
  const { setNodeRef } = useDroppable({ id: group.key });
  const attentionCount = group.sessions.filter((s) => s.status === 'needs-attention').length;

  return (
    <div ref={setNodeRef} data-testid={`group-${group.key}`} style={{ marginBottom: 4 }}>
      <button
        data-testid={`group-header-${group.key}`}
        onClick={() => onToggle(group)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '4px 8px',
          background: 'transparent',
          border: 'none',
          color: uiColors.sidebarHeaderText,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-block', width: 10 }}>{group.collapsed ? '▸' : '▾'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.name}
        </span>
        <span style={{ color: uiColors.appTextFaint, fontWeight: 500 }}>
          {attentionCount > 0 ? `${attentionCount}!` : group.sessions.length}
        </span>
      </button>
      {!group.collapsed && (
        <SortableContext items={group.sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {group.sessions.map((session) => (
            <SortableSessionTab
              key={session.id}
              session={sessionMap.get(session.id) ?? session}
              isActive={session.id === activeSessionId}
              hasUnread={unread.has(session.id)}
              hasQueuedPrompt={session.id in queued}
              onSelect={() => onSelect(session.id)}
              onContextMenu={(e) => onContextMenu(session.id, e)}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

export default function Sidebar(): React.ReactElement {
  const { state, setActiveSession, removeSession, updateSessionName, reorderSessions } = useSessions();
  const { prefs, updatePrefs } = usePreferences();
  const { state: queuedState } = useQueuedPrompts();
  const { uiColors } = prefs;
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [daemonNames, setDaemonNames] = useState<Record<string, string>>({});
  // Working copy of group membership during/after drag, keyed by group key.
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [groupOrder, setGroupOrder] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Resolve daemon names for host-default group headers.
  useEffect(() => {
    let active = true;
    const load = () => {
      window.switchboard.daemon.statuses().then((list) => {
        if (active) setDaemonNames(Object.fromEntries(list.map((d) => [d.id, d.name])));
      }).catch(() => {});
    };
    load();
    const unsub = window.switchboard.daemon.onStatusChanged(() => load());
    return () => { active = false; unsub(); };
  }, []);

  const computed = computeGroups(state.sessions, prefs.sessionGroups ?? {}, daemonNames);

  // Sync the dnd working copy from props when not actively dragging.
  useEffect(() => {
    if (activeId) return;
    setGroupOrder(computed.map((g) => g.key));
    setItems(Object.fromEntries(computed.map((g) => [g.key, g.sessions.map((s) => s.id)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(computed.map((g) => [g.key, g.sessions.map((s) => s.id)])), activeId]);

  const sessionMap = new Map(state.sessions.map((s) => [s.id, s]));

  const findContainer = useCallback((id: string): string | undefined => {
    if (id in items) return id;
    return groupOrder.find((key) => items[key]?.includes(id));
  }, [items, groupOrder]);

  const persist = useCallback((nextItems: Record<string, string[]>, order: string[]) => {
    const prevGroups = prefs.sessionGroups ?? {};
    const nextGroups: Record<string, SessionGroup> = {};
    for (const key of order) {
      const prev = prevGroups[key];
      const name = prev?.name
        ?? (isHostGroup(key)
          ? daemonNames[key.slice('daemon-'.length)] ?? friendlyDaemonName(key.slice('daemon-'.length))
          : 'Group');
      nextGroups[key] = { name, collapsed: prev?.collapsed ?? false, sessionIds: nextItems[key] ?? [] };
    }
    for (const [k, g] of Object.entries(prevGroups)) if (!(k in nextGroups)) nextGroups[k] = g;
    const flatOrder = order.flatMap((k) => nextItems[k] ?? []);
    updatePrefs({ sessionGroups: nextGroups, sessionOrder: flatOrder });
    reorderSessions(flatOrder);
  }, [prefs.sessionGroups, daemonNames, updatePrefs, reorderSessions]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;
    setItems((prev) => {
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const overIndex = overItems.indexOf(String(over.id));
      const insertAt = String(over.id) in prev ? overItems.length : overIndex >= 0 ? overIndex : overItems.length;
      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== String(active.id)),
        [overContainer]: [...overItems.slice(0, insertAt), String(active.id), ...overItems.slice(insertAt)],
      };
    });
  }, [findContainer]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeContainer = findContainer(String(active.id));
    const overContainer = findContainer(String(over.id));
    if (!activeContainer || !overContainer) return;

    let next = items;
    if (activeContainer === overContainer) {
      const arr = items[activeContainer] ?? [];
      const oldIndex = arr.indexOf(String(active.id));
      const newIndex = String(over.id) in items ? arr.length - 1 : arr.indexOf(String(over.id));
      if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
        next = { ...items, [activeContainer]: arrayMove(arr, oldIndex, newIndex) };
        setItems(next);
      }
    }
    persist(next, groupOrder);
  }, [items, groupOrder, findContainer, persist]);

  const handleContextMenu = useCallback((sessionId: string, e: React.MouseEvent) => {
    if (activeId) return;
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, [activeId]);

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

  const handleToggleGroup = useCallback((group: ComputedGroup) => {
    updatePrefs({ sessionGroups: toggleCollapse(prefs.sessionGroups ?? {}, group.key, group.name) });
  }, [prefs.sessionGroups, updatePrefs]);

  const moveSessionToGroup = useCallback((sessionId: string, key: string, name: string) => {
    updatePrefs({ sessionGroups: moveToGroup(prefs.sessionGroups ?? {}, sessionId, key, name) });
  }, [prefs.sessionGroups, updatePrefs]);

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
        position: 'relative',
      }}
    >
      {prefs.sidebarBackgroundImage && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url(${prefs.sidebarBackgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          padding: '16px 14px 12px',
          fontSize: 'inherit',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: uiColors.sidebarHeaderText,
          position: 'relative',
          zIndex: 1,
        }}
      >
        Sessions
      </div>
      <div style={{ flex: 1, padding: '0 6px', overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        {state.sessions.length === 0 ? (
          <div style={{ padding: '0 8px', fontSize: 'inherit', color: uiColors.appTextFaint }}>
            No sessions yet
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {computed.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                sessionMap={sessionMap}
                activeSessionId={state.activeSessionId}
                unread={state.unreadSessions}
                queued={queuedState.queued}
                onSelect={setActiveSession}
                onContextMenu={handleContextMenu}
                onToggle={handleToggleGroup}
                uiColors={uiColors as unknown as Record<string, string>}
              />
            ))}
          </DndContext>
        )}
      </div>
      {contextMenu && (() => {
        const sid = contextMenu.sessionId;
        const current = prefs.notificationPriorities?.[sid] ?? 'normal';
        const priorities: Array<{ value: 'high' | 'normal' | 'silent'; label: string }> = [
          { value: 'high', label: 'High (always notify)' },
          { value: 'normal', label: 'Normal (when unfocused)' },
          { value: 'silent', label: 'Silent (never notify)' },
        ];
        const customGroups = Object.entries(prefs.sessionGroups ?? {}).filter(([k]) => !isHostGroup(k));
        const moveItems = [
          ...customGroups.map(([k, g]) => ({
            label: g.name || '(unnamed group)',
            action: () => moveSessionToGroup(sid, k, g.name),
          })),
          {
            label: 'New group…',
            action: () => {
              const name = prompt('New group name:');
              if (name && name.trim()) {
                moveSessionToGroup(sid, `group-${crypto.randomUUID()}`, name.trim());
              }
            },
          },
          {
            label: 'Ungroup (host default)',
            action: () => moveSessionToGroup(sid, hostGroupKey(daemonIdOf(sid)), friendlyDaemonName(daemonIdOf(sid))),
          },
        ];
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={[
              { label: 'Rename', action: handleRename },
              {
                label: 'Notifications',
                submenu: priorities.map((p) => ({
                  label: p.label,
                  checked: current === p.value,
                  action: () => {
                    try {
                      window.switchboard.session.setPriority(sid, p.value);
                    } catch {
                      // ignore — main rejects invalid input
                    }
                  },
                })),
              },
              { label: 'Move to group', submenu: moveItems },
              { label: 'Close Session', action: handleClose, shortcut: 'Ctrl+W' },
            ]}
          />
        );
      })()}
    </div>
  );
}
