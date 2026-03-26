import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { SessionManager } from './session-manager';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;
const sessionManager = new SessionManager();

const isDev = !app.isPackaged;

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'Switchboard',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    window.loadURL('http://localhost:5173');
  } else {
    window.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  registerIpcHandlers(sessionManager);
  mainWindow = createWindow();

  // Intercept Ctrl+Tab / Ctrl+Shift+Tab before Chromium eats them
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'Tab') {
      event.preventDefault();
      mainWindow?.webContents.send('shortcut:cycle-tab', { shift: input.shift });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  sessionManager.closeAll();
});
