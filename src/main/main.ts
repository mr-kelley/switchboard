import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { SessionManager } from './session-manager';
import { ConnectionManager } from './connection-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { PreferencesStore } from './preferences-store';

let mainWindow: BrowserWindow | null = null;
const sessionManager = new SessionManager();
const connectionManager = new ConnectionManager();

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
  // Load daemon connections from preferences
  const prefsStore = new PreferencesStore();
  const prefs = prefsStore.load();
  const daemonConnections = (prefs as any).daemonConnections || [];
  for (const conn of daemonConnections) {
    if (conn && conn.id && conn.host && conn.port && conn.token) {
      connectionManager.addConnection(conn);
    }
  }

  registerIpcHandlers(sessionManager, connectionManager);
  mainWindow = createWindow();

  // Intercept Ctrl+Tab / Ctrl+Shift+Tab before Chromium eats them
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'Tab') {
      event.preventDefault();
      mainWindow?.webContents.send('shortcut:cycle-tab', { shift: input.shift });
    }
  });

  // Auto-connect to configured daemons
  connectionManager.connectAll();

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
  connectionManager.disconnectAll();
  sessionManager.closeAll();
});
