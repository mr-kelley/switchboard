import { ipcMain, BrowserWindow } from 'electron';
import { SessionManager } from './session-manager';
import { IdleDetector } from './idle-detector';

function broadcast(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
}

export function registerIpcHandlers(sessionManager: SessionManager): void {
  // Create idle detector that broadcasts status changes to renderer
  const idleDetector = new IdleDetector((sessionId, status) => {
    sessionManager.updateStatus(sessionId, status);
    broadcast('session:status-changed', { sessionId, status });
  });

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
  });

  // session:list — list all sessions
  ipcMain.handle('session:list', () => {
    return sessionManager.getAll();
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
  });
}
