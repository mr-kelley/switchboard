import { ipcMain, BrowserWindow } from 'electron';
import { SessionManager } from './session-manager';

export function registerIpcHandlers(sessionManager: SessionManager): void {
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
    return sessionManager.spawn({
      name: args.name.trim(),
      cwd: args.cwd.trim(),
      command: args.command?.trim() || undefined,
    });
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
    sessionManager.close(args.sessionId);
  });

  // session:list — list all sessions
  ipcMain.handle('session:list', () => {
    return sessionManager.getAll();
  });

  // pty:input — send input to a session (fire-and-forget)
  ipcMain.on('pty:input', (_event, args: { sessionId: string; data: string }) => {
    if (!args || typeof args.sessionId !== 'string' || typeof args.data !== 'string') {
      return; // Silent drop for invalid fire-and-forget messages
    }
    try {
      sessionManager.write(args.sessionId, args.data);
    } catch {
      // Session may have been closed — silent drop
    }
  });

  // Wire up session manager events to renderer
  sessionManager.setOnData((sessionId: string, data: string) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('pty:data', { sessionId, data });
    }
  });

  sessionManager.setOnExit((sessionId: string, exitCode: number) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('pty:exit', { sessionId, exitCode });
    }
  });
}
