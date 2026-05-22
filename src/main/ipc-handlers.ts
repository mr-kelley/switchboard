import { ipcMain, BrowserWindow, dialog } from 'electron';
import { PreferencesStore } from './preferences-store';
import { ConnectionManager, type DaemonConnectionConfig } from './connection-manager';
import type { SwitchboardPreferences } from '../shared/types';

function broadcast(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
}

export function registerIpcHandlers(connectionManager: ConnectionManager): void {
  const preferencesStore = new PreferencesStore();

  // --- Session commands (all route to daemon) ---

  ipcMain.handle('pty:spawn', (_event, args: { name: string; cwd: string; command?: string; daemonId?: string }) => {
    if (!args || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('pty:spawn requires a non-empty name');
    }
    if (typeof args.cwd !== 'string' || !args.cwd.trim()) {
      throw new Error('pty:spawn requires a non-empty cwd');
    }

    const daemonId = args.daemonId || connectionManager.getDefaultDaemonId();
    if (!daemonId) {
      throw new Error('No daemon connected. Add one in Preferences → Daemons.');
    }

    connectionManager.spawn(daemonId, args.name.trim(), args.cwd.trim(), args.command?.trim());
    return null;
  });

  ipcMain.handle('pty:resize', (_event, args: { sessionId: string; cols: number; rows: number }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:resize requires a sessionId');
    }
    if (typeof args.cols !== 'number' || typeof args.rows !== 'number') {
      throw new Error('pty:resize requires numeric cols and rows');
    }
    connectionManager.resize(args.sessionId, args.cols, args.rows);
  });

  ipcMain.handle('pty:close', (_event, args: { sessionId: string }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:close requires a sessionId');
    }
    connectionManager.close(args.sessionId);
  });

  ipcMain.handle('session:list', () => {
    return connectionManager.getAllSessions();
  });

  ipcMain.handle('session:rename', (_event, args: { sessionId: string; name: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('session:rename requires sessionId and non-empty name');
    }
    connectionManager.rename(args.sessionId, args.name.trim());
  });

  ipcMain.on('pty:input', (_event, args: { sessionId: string; data: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.data !== 'string') {
      return;
    }
    connectionManager.input(args.sessionId, args.data);
  });

  ipcMain.handle('session:queue-prompt', (_event, args: { sessionId: string; text: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.text !== 'string') {
      throw new Error('session:queue-prompt requires sessionId and text');
    }
    connectionManager.queuePrompt(args.sessionId, args.text);
  });

  ipcMain.handle('session:clear-queue', (_event, args: { sessionId: string }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('session:clear-queue requires sessionId');
    }
    connectionManager.clearQueue(args.sessionId);
  });

  ipcMain.handle('session:replay-request', (_event, args: { sessionId: string }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('session:replay-request requires sessionId');
    }
    connectionManager.requestReplay(args.sessionId);
  });

  // --- Daemon connection management ---

  ipcMain.handle('daemon:add', (_event, config: DaemonConnectionConfig) => {
    connectionManager.addConnection(config);
  });

  ipcMain.handle('daemon:connect', (_event, daemonId: string) => {
    connectionManager.connect(daemonId);
  });

  ipcMain.handle('daemon:disconnect', (_event, daemonId: string) => {
    connectionManager.disconnect(daemonId);
  });

  ipcMain.handle('daemon:remove', (_event, daemonId: string) => {
    connectionManager.removeConnection(daemonId);
  });

  ipcMain.handle('daemon:pair', (_event, args: { host: string; port: number; clientName: string }) => {
    return connectionManager.pair(args.host, args.port, args.clientName);
  });

  ipcMain.handle('daemon:submit-code', (_event, code: string) => {
    connectionManager.submitPairingCode(code);
  });

  ipcMain.handle('daemon:statuses', () => {
    return connectionManager.getConnectionStatuses();
  });

  // --- Preferences ---

  ipcMain.handle('preferences:load', () => {
    return preferencesStore.load();
  });

  ipcMain.handle('preferences:save', (_event, prefs: SwitchboardPreferences) => {
    preferencesStore.save(prefs);
    broadcast('preferences:changed', prefs);
  });

  ipcMain.handle('preferences:reset', () => {
    const defaults = preferencesStore.reset();
    broadcast('preferences:changed', defaults);
    return defaults;
  });

  // --- Dialog ---

  ipcMain.handle('dialog:open-file', async (_event, args?: { filters?: Electron.FileFilter[] }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: args?.filters || [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
