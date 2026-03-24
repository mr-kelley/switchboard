import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { mockUsePreferences } from '../helpers/mock-preferences';

vi.mock('../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import ContextMenu from '../../src/renderer/components/ContextMenu';

describe('ContextMenu', () => {
  it('renders menu items', () => {
    render(
      <ContextMenu
        x={100}
        y={200}
        onClose={vi.fn()}
        items={[
          { label: 'Rename', action: vi.fn() },
          { label: 'Close', action: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('calls action and onClose when item clicked', () => {
    const action = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={100}
        y={200}
        onClose={onClose}
        items={[{ label: 'Rename', action }]}
      />
    );
    fireEvent.click(screen.getByText('Rename'));
    expect(action).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('is positioned at specified coordinates', () => {
    render(
      <ContextMenu
        x={150}
        y={250}
        onClose={vi.fn()}
        items={[{ label: 'Test', action: vi.fn() }]}
      />
    );
    const menu = screen.getByTestId('context-menu');
    expect(menu.style.top).toBe('250px');
    expect(menu.style.left).toBe('150px');
  });
});
