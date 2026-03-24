import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { mockUsePreferences } from '../../helpers/mock-preferences';

const mockResetPrefs = vi.fn();
const mockUpdatePrefs = vi.fn();

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => ({
    ...mockUsePreferences,
    resetPrefs: mockResetPrefs,
    updatePrefs: mockUpdatePrefs,
  }),
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import PreferencesModal from '../../../src/renderer/components/PreferencesModal';

describe('PreferencesModal', () => {
  it('renders when isOpen is true', () => {
    render(<PreferencesModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('preferences-modal')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<PreferencesModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('preferences-modal')).not.toBeInTheDocument();
  });

  it('shows theme dropdown with all presets', () => {
    render(<PreferencesModal isOpen={true} onClose={vi.fn()} />);
    const select = screen.getByTestId('theme-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('catppuccin-mocha');
    expect(options).toContain('dracula');
    expect(options).toContain('nord');
  });

  it('reset button calls resetPrefs', () => {
    render(<PreferencesModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('prefs-reset-button'));
    expect(mockResetPrefs).toHaveBeenCalled();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<PreferencesModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('prefs-close-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('switching theme section tabs works', () => {
    render(<PreferencesModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('prefs-tab-font'));
    expect(screen.getByText('Terminal Font Family')).toBeInTheDocument();
  });
});
