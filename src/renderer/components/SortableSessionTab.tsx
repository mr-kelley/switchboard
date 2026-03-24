import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionInfo } from '../../shared/types';
import SessionTab from './SessionTab';

interface SortableSessionTabProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export default function SortableSessionTab({
  session,
  isActive,
  onSelect,
  onContextMenu,
}: SortableSessionTabProps): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`sortable-tab-${session.id}`}
      {...attributes}
      {...listeners}
    >
      <SessionTab
        session={session}
        isActive={isActive}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
