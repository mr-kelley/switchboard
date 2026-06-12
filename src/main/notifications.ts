import { Notification, BrowserWindow } from 'electron';
import type { NotificationPriority } from '../shared/types';

export function notifyIfNeeded(
  sessionName: string,
  isFocused: boolean,
  priority: NotificationPriority = 'normal'
): void {
  if (priority === 'silent') return;
  // normal fires only when unfocused; high always fires.
  if (priority !== 'high' && isFocused) return;

  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: 'Switchboard',
    body: `${sessionName} needs your attention`,
  });

  notification.show();
}

export function isAppFocused(): boolean {
  const windows = BrowserWindow.getAllWindows();
  return windows.some((w) => w.isFocused());
}
