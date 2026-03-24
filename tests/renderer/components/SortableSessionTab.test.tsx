import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { mockUsePreferences } from '../../helpers/mock-preferences';

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import type { SessionInfo } from '../../../src/shared/types';
import SortableSessionTab from '../../../src/renderer/components/SortableSessionTab';

const mockSession: SessionInfo = {
  id: 'test-1',
  name: 'Test Session',
  cwd: '/tmp',
  command: 'bash',
  pid: 123,
  status: 'working',
};

function renderWithDnd(ui: React.ReactElement) {
  return render(
    <DndContext>
      <SortableContext items={['test-1']} strategy={verticalListSortingStrategy}>
        {ui}
      </SortableContext>
    </DndContext>
  );
}

describe('SortableSessionTab', () => {
  it('renders with correct data-testid', () => {
    renderWithDnd(
      <SortableSessionTab
        session={mockSession}
        isActive={false}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(screen.getByTestId('sortable-tab-test-1')).toBeInTheDocument();
  });

  it('renders SessionTab with session name', () => {
    renderWithDnd(
      <SortableSessionTab
        session={mockSession}
        isActive={true}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(screen.getByText('Test Session')).toBeInTheDocument();
    expect(screen.getByTestId('session-tab-test-1')).toBeInTheDocument();
  });

  it('renders status dot', () => {
    renderWithDnd(
      <SortableSessionTab
        session={mockSession}
        isActive={false}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
      />
    );
    expect(screen.getByTestId('status-dot-test-1')).toBeInTheDocument();
  });
});
