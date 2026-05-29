import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { ConnectionManager } from './connection-manager';
import { registerIpcHandlers } from './ipc-handlers';
import { PreferencesStore } from './preferences-store';
import { LocalDaemon } from './local-daemon';
import { createTray, type TrayHandle } from './tray';

let mainWindow: BrowserWindow | null = null;
let tray: TrayHandle | null = null;
let isQuitting = false;
const prefsStore = new PreferencesStore();
const connectionManager = new ConnectionManager(prefsStore);
const localDaemon = new LocalDaemon();

const isDev = !app.isPackaged;

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

function setupWindow(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === 'Tab') {
      event.preventDefault();
      window.webContents.send('shortcut:cycle-tab', { shift: input.shift });
    }
    if (input.control && (input.key === 'q' || input.key === 'Q')) {
      event.preventDefault();
      quitApp();
    }
  });

  // Minimize-to-tray: while the tray is active, closing the window hides it
  // instead of quitting. An explicit quit (tray menu / Ctrl+Q / before-quit)
  // sets isQuitting so the close proceeds normally.
  window.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      window.hide();
    }
  });
}

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

  setupWindow(window);
  return window;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  const prefs = prefsStore.load();
  for (const conn of prefs.daemonConnections) {
    if (conn && conn.id && conn.host && conn.port && conn.token) {
      connectionManager.addConnection(conn);
    }
  }

  try {
    const localConfig = await localDaemon.start();
    connectionManager.addConnection(localConfig);
  } catch (err) {
    console.error('Failed to auto-start localhost daemon:', err);
  }

  registerIpcHandlers(connectionManager, localDaemon);
  mainWindow = createWindow();

  // Create the tray. If the platform has no tray host, createTray returns null
  // and we fall back to quit-on-close (handled in window-all-closed).
  tray = createTray({
    connectionManager,
    showWindow: showMainWindow,
    focusAttention: () => mainWindow?.webContents.send('tray:focus-attention'),
    quit: quitApp,
  });

  connectionManager.connectAll();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // With an active tray, windows hide rather than close, so this only fires on
  // a real quit. Without a tray, preserve the original quit-on-close behavior.
  if (!tray) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  connectionManager.disconnectAll();
  localDaemon.stop();
  tray?.destroy();
  tray = null;
});
