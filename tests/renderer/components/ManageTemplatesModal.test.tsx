import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockUsePreferences, mockPrefs } from '../../helpers/mock-preferences';

vi.mock('../../../src/renderer/state/preferences', () => ({
  usePreferences: () => mockUsePreferences,
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import ManageTemplatesModal from '../../../src/renderer/components/ManageTemplatesModal';

beforeEach(() => {
  (mockPrefs as any).sessionTemplates = [
    { id: 't1', name: 'Dev', daemonId: 'localhost', cwd: '/home/a', command: 'claude' },
    { id: 't2', name: 'Logs', daemonId: '', cwd: '/var/log', command: 'tail -f x' },
  ];
  mockUsePreferences.updatePrefs.mockClear();
});

describe('ManageTemplatesModal', () => {
  it('does not render when closed', () => {
    render(<ManageTemplatesModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('manage-templates-modal')).not.toBeInTheDocument();
  });

  it('renders a row per template', () => {
    render(<ManageTemplatesModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('template-row-t1')).toBeInTheDocument();
    expect(screen.getByTestId('template-row-t2')).toBeInTheDocument();
  });

  it('shows an empty state when there are no templates', () => {
    (mockPrefs as any).sessionTemplates = [];
    render(<ManageTemplatesModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('templates-empty')).toBeInTheDocument();
  });

  it('deletes a template and persists the shortened list', () => {
    render(<ManageTemplatesModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('delete-template-t1'));
    expect(mockUsePreferences.updatePrefs).toHaveBeenCalledTimes(1);
    const arg = mockUsePreferences.updatePrefs.mock.calls[0][0];
    expect(arg.sessionTemplates.map((t: { id: string }) => t.id)).toEqual(['t2']);
  });

  it('edits a field and persists the updated template', () => {
    render(<ManageTemplatesModal isOpen={true} onClose={vi.fn()} />);
    const nameInput = within(screen.getByTestId('template-row-t1')).getByLabelText('name');
    fireEvent.change(nameInput, { target: { value: 'Dev2' } });
    expect(mockUsePreferences.updatePrefs).toHaveBeenCalled();
    const arg = mockUsePreferences.updatePrefs.mock.calls.at(-1)![0];
    expect(arg.sessionTemplates.find((t: { id: string }) => t.id === 't1').name).toBe('Dev2');
  });
});
