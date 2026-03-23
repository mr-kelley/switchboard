import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShow = vi.fn();
const mockIsSupported = vi.fn().mockReturnValue(true);

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({
      show: mockShow,
    })),
    {
      isSupported: () => mockIsSupported(),
    }
  ),
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

import { notifyIfNeeded } from '../../src/main/notifications';

describe('notifyIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows notification when app is not focused', () => {
    notifyIfNeeded('my-project', false);
    expect(mockShow).toHaveBeenCalledOnce();
  });

  it('does not show notification when app is focused', () => {
    notifyIfNeeded('my-project', true);
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('does not show notification when not supported', () => {
    mockIsSupported.mockReturnValueOnce(false);
    notifyIfNeeded('my-project', false);
    expect(mockShow).not.toHaveBeenCalled();
  });
});
