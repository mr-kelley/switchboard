import { ipcMain, BrowserWindow } from 'electron';
import { SessionManager } from './session-manager';
import { IdleDetector } from './idle-detector';
import { SessionStore } from './session-store';
import { notifyIfNeeded, isAppFocused } from './notifications';

function broadcast(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
}

export function registerIpcHandlers(sessionManager: SessionManager): void {
  const sessionStore = new SessionStore();
  const idleDetector = new IdleDetector((sessionId, status) => {
    sessionManager.updateStatus(sessionId, status);
    broadcast('session:status-changed', { sessionId, status });

    // Fire notification if session needs attention and app is not focused
    if (status === 'needs-attention') {
      const session = sessionManager.getSession(sessionId);
      if (session) {
        notifyIfNeeded(session.name, isAppFocused());
      }
    }
  });

  // Helper to persist current sessions
  function persistSessions(): void {
    const sessions = sessionManager.getAll();
    sessionStore.save(sessions.map((s) => ({ name: s.name, cwd: s.cwd, command: s.command })));
  }

  // Restore saved sessions on startup
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
      // Skip sessions that fail to restore (e.g., directory no longer exists)
    }
  }

  // pty:spawn — create a new session
  ipcMain.handle('pty:spawn', (_event, args: { name: string; cwd: string; command?: string }) => {
    if (!args || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('pty:spawn requires a non-empty name');
    }
    if (typeof args.cwd !== 'string' || !args.cwd.trim()) {
      throw new Error('pty:spawn requires a non-empty cwd');
    }
    if (args.command !== undefined && typeof args.command !== 'string') {
      throw new Error('pty:spawn command must be a string if provided');
    }
    const session = sessionManager.spawn({
      name: args.name.trim(),
      cwd: args.cwd.trim(),
      command: args.command?.trim() || undefined,
    });
    idleDetector.addSession(session.id);
    persistSessions();
    return session;
  });

  // pty:resize — resize a session's PTY
  ipcMain.handle('pty:resize', (_event, args: { sessionId: string; cols: number; rows: number }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:resize requires a sessionId');
    }
    if (typeof args.cols !== 'number' || typeof args.rows !== 'number') {
      throw new Error('pty:resize requires numeric cols and rows');
    }
    sessionManager.resize(args.sessionId, args.cols, args.rows);
  });

  // pty:close — close a session
  ipcMain.handle('pty:close', (_event, args: { sessionId: string }) => {
    if (!args || typeof args.sessionId !== 'string') {
      throw new Error('pty:close requires a sessionId');
    }
    idleDetector.removeSession(args.sessionId);
    sessionManager.close(args.sessionId);
    persistSessions();
  });

  // session:list — list all sessions
  ipcMain.handle('session:list', () => {
    return sessionManager.getAll();
  });

  // session:rename — rename a session
  ipcMain.handle('session:rename', (_event, args: { sessionId: string; name: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.name !== 'string' || !args.name.trim()) {
      throw new Error('session:rename requires sessionId and non-empty name');
    }
    const session = sessionManager.getSession(args.sessionId);
    if (!session) throw new Error('Session not found');
    // Update name via session manager
    const sessions = sessionManager.getAll();
    const target = sessions.find((s) => s.id === args.sessionId);
    if (target) {
      // Use the updateStatus approach — we need an updateName method
      // For now, broadcast the rename to renderer
      broadcast('session:renamed', { sessionId: args.sessionId, name: args.name.trim() });
    }
    persistSessions();
  });

  // pty:input — send input to a session (fire-and-forget)
  ipcMain.on('pty:input', (_event, args: { sessionId: string; data: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.data !== 'string') {
      return;
    }
    try {
      idleDetector.onInput(args.sessionId);
      sessionManager.write(args.sessionId, args.data);
    } catch {
      // Session may have been closed
    }
  });

  // Wire up session manager events to renderer + idle detector
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
