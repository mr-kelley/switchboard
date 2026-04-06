import * as pty from 'node-pty';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type { SessionStatus, SessionInfo } from '../shared/protocol';

interface SessionConfig {
  name: string;
  cwd: string;
  command?: string;
}

interface ManagedSession {
  info: SessionInfo;
  pty: pty.IPty;
}

export class PtyManager {
  private sessions = new Map<string, ManagedSession>();
  private onData?: (sessionId: string, data: string) => void;
  private onExit?: (sessionId: string, exitCode: number) => void;
  private onStatusChange?: (sessionId: string, status: SessionStatus) => void;

  setOnData(handler: (sessionId: string, data: string) => void): void {
    this.onData = handler;
  }

  setOnExit(handler: (sessionId: string, exitCode: number) => void): void {
    this.onExit = handler;
  }

  setOnStatusChange(handler: (sessionId: string, status: SessionStatus) => void): void {
    this.onStatusChange = handler;
  }

  spawn(config: SessionConfig): SessionInfo {
    const id = randomUUID();
    const shell = config.command || this.getDefaultShell();

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: config.cwd,
      env: process.env as Record<string, string>,
    });

    const info: SessionInfo = {
      id,
      name: config.name,
      cwd: config.cwd,
      command: shell,
      pid: ptyProcess.pid,
      status: 'working',
    };

    const managed: ManagedSession = { info, pty: ptyProcess };
    this.sessions.set(id, managed);

    ptyProcess.onData((data: string) => {
      this.onData?.(id, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      this.sessions.delete(id);
      this.onExit?.(id, exitCode);
    });

    return { ...info };
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      throw new Error(`Invalid dimensions: ${cols}x${rows}`);
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.pty.resize(cols, rows);
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    try {
      session.pty.kill();
    } catch {
      // PTY may already be dead
    }
    this.sessions.delete(sessionId);
  }

  rename(sessionId: string, name: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.info.name = name;
  }

  getAll(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s.info }));
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.info } : undefined;
  }

  updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.info.status = status;
      this.onStatusChange?.(sessionId, status);
    }
  }

  closeAll(): void {
    for (const [id] of this.sessions) {
      try {
        this.close(id);
      } catch {
        // Best-effort cleanup
      }
    }
  }

  private getDefaultShell(): string {
    if (os.platform() === 'win32') {
      return 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}
