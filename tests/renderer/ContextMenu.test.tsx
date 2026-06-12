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

  it('reveals submenu options and fires the selected one', () => {
    const high = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        onClose={onClose}
        items={[
          {
            label: 'Notifications',
            submenu: [
              { label: 'High', action: high },
              { label: 'Normal', action: vi.fn(), checked: true },
            ],
          },
        ]}
      />
    );
    // Submenu hidden until the parent is opened.
    expect(screen.queryByText('High')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Notifications'));
    expect(screen.getByText('High')).toBeInTheDocument();
    // Checked option shows a check mark.
    expect(screen.getByText('✓ Normal')).toBeInTheDocument();
    // Selecting a leaf fires its action and closes the menu.
    fireEvent.click(screen.getByText('High'));
    expect(high).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking a submenu parent does not close the menu', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={0}
        y={0}
        onClose={onClose}
        items={[{ label: 'Notifications', submenu: [{ label: 'High', action: vi.fn() }] }]}
      />
    );
    fireEvent.click(screen.getByText('Notifications'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
