import { ipcMain, BrowserWindow, dialog } from 'electron';
import { SessionManager } from './session-manager';
import { IdleDetector } from './idle-detector';
import { SessionStore } from './session-store';
import { PreferencesStore } from './preferences-store';
import { ConnectionManager, type DaemonConnectionConfig } from './connection-manager';
import { notifyIfNeeded, isAppFocused } from './notifications';
import type { SwitchboardPreferences } from '../shared/types';

function broadcast(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
}

export function registerIpcHandlers(sessionManager: SessionManager, connectionManager: ConnectionManager): void {
  const sessionStore = new SessionStore();
  const preferencesStore = new PreferencesStore();
  const idleDetector = new IdleDetector((sessionId, status) => {
    sessionManager.updateStatus(sessionId, status);
    broadcast('session:status-changed', { sessionId, status });

    if (status === 'needs-attention') {
      const session = sessionManager.getSession(sessionId);
      if (session) {
        notifyIfNeeded(session.name, isAppFocused());
      }
    }
  });

  function persistSessions(): void {
    const sessions = sessionManager.getAll();
    sessionStore.save(sessions.map((s) => ({ name: s.name, cwd: s.cwd, command: s.command })));
  }

  // Restore saved local sessions on startup (only when no daemons configured)
  if (!connectionManager.hasDaemons()) {
    const savedSessions = sessionStore.load();
    for (const saved of savedSessions) {
      try {
        const session = sessionManager.spawn({
          name: saved.name,
          cwd: saved.cwd,
          command: saved.command,
        });
        idleDetector.addSession(session.id);
      } catch {
        // Skip sessions that fail to restore
      }
    }
  }

  // --- Session commands (route to daemon or local) ---

  ipcMain.handle('pty:spawn', (_event, args: { name: string; cwd: string; command?: string; daemonId?: string }) => {
    if (!args || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('pty:spawn requires a non-empty name');
    }
    if (typeof args.cwd !== 'string' || !args.cwd.trim()) {
      throw new Error('pty:spawn requires a non-empty cwd');
    }

    const daemonId = args.daemonId || connectionManager.getDefaultDaemonId();
    if (daemonId) {
      // Route to daemon
      connectionManager.spawn(daemonId, args.name.trim(), args.cwd.trim(), args.command?.trim());
      // Session will arrive via daemon:session-created broadcast
      return null; // Async — renderer will get the session via event
    }

    // Local fallback
    const session = sessionManager.spawn({
      name: args.name.trim(),
      cwd: args.cwd.trim(),
      command: args.command?.trim() || undefined,
    });
    idleDetector.addSession(session.id);
    persistSessions();
    return session;
  });

  ipcMain.handle('pty:resize', (_event, args: { sessionId: string; cols: number; rows: number }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:resize requires a sessionId');
    }
    if (typeof args.cols !== 'number' || typeof args.rows !== 'number') {
      throw new Error('pty:resize requires numeric cols and rows');
    }

    if (args.sessionId.includes(':')) {
      connectionManager.resize(args.sessionId, args.cols, args.rows);
    } else {
      sessionManager.resize(args.sessionId, args.cols, args.rows);
    }
  });

  ipcMain.handle('pty:close', (_event, args: { sessionId: string }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:close requires a sessionId');
    }

    if (args.sessionId.includes(':')) {
      connectionManager.close(args.sessionId);
    } else {
      idleDetector.removeSession(args.sessionId);
      sessionManager.close(args.sessionId);
      persistSessions();
    }
  });

  ipcMain.handle('session:list', () => {
    const localSessions = sessionManager.getAll();
    const daemonSessions = connectionManager.getAllSessions();
    return [...localSessions, ...daemonSessions];
  });

  ipcMain.handle('session:rename', (_event, args: { sessionId: string; name: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('session:rename requires sessionId and non-empty name');
    }

    if (args.sessionId.includes(':')) {
      connectionManager.rename(args.sessionId, args.name.trim());
    } else {
      broadcast('session:renamed', { sessionId: args.sessionId, name: args.name.trim() });
      persistSessions();
    }
  });

  ipcMain.on('pty:input', (_event, args: { sessionId: string; data: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.data !== 'string') {
      return;
    }

    if (args.sessionId.includes(':')) {
      connectionManager.input(args.sessionId, args.data);
    } else {
      try {
        idleDetector.onInput(args.sessionId);
        sessionManager.write(args.sessionId, args.data);
      } catch {
        // Session may have been closed
      }
    }
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

  // --- Wire up local session manager events ---

  sessionManager.setOnData((sessionId: string, data: string) => {
    idleDetector.onOutput(sessionId, data);
    broadcast('pty:data', { sessionId, data });
  });

  sessionManager.setOnExit((sessionId: string, exitCode: number) => {
    idleDetector.removeSession(sessionId);
    broadcast('pty:exit', { sessionId, exitCode });
    persistSessions();
  });
}
