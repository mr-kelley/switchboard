import { Notification, BrowserWindow } from 'electron';

export function notifyIfNeeded(sessionName: string, isFocused: boolean): void {
  if (isFocused) return;

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
