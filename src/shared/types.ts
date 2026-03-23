export type SessionStatus = 'working' | 'idle' | 'needs-attention';

export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  command: string;
  pid: number;
  status: SessionStatus;
}

export interface SessionConfig {
  name: string;
  cwd: string;
  command?: string;
}

/** API exposed by the preload script via contextBridge. */
export interface SwitchboardAPI {
  platform: NodeJS.Platform;
  pty: {
    spawn(config: SessionConfig): Promise<SessionInfo>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
    input(sessionId: string, data: string): void;
    onData(callback: (sessionId: string, data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number) => void): () => void;
  };
  session: {
    list(): Promise<SessionInfo[]>;
    onStatusChanged(callback: (sessionId: string, status: SessionStatus) => void): () => void;
  };
}

declare global {
  interface Window {
    switchboard: SwitchboardAPI;
  }
}
