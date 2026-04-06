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

export interface TerminalThemeColors {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface UIThemeColors {
  appBg: string;
  appText: string;
  appTextMuted: string;
  appTextFaint: string;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarHeaderText: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  tabActiveBg: string;
  tabActiveText: string;
  tabInactiveText: string;
  buttonBg: string;
  buttonText: string;
  buttonHoverBg: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonBorder: string;
  contextMenuBg: string;
  contextMenuBorder: string;
  contextMenuText: string;
  contextMenuHoverBg: string;
  modalOverlayBg: string;
  modalBg: string;
  modalBorder: string;
  modalText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  statusWorking: string;
  statusIdle: string;
  statusNeedsAttention: string;
  statusDefault: string;
  accentPrimary: string;
  errorText: string;
}

export interface SwitchboardPreferences {
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  uiFontFamily: string;
  uiFontSize: number;
  themeName: string;
  terminalColors: TerminalThemeColors;
  uiColors: UIThemeColors;
  terminalBackgroundImage: string | null;
  terminalBackgroundOpacity: number;
  sidebarBackgroundImage: string | null;
  shortcuts: Record<string, string>;
  sessionOrder: string[];
  cursorBlink: boolean;
  scrollbackLines: number;
  customCssPath: string | null;
}

/** API exposed by the preload script via contextBridge. */
export interface SwitchboardAPI {
  platform: NodeJS.Platform;
  dialog: {
    openFile(filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
  };
  onCycleTab(callback: (shift: boolean) => void): () => void;
  pty: {
    spawn(config: SessionConfig & { daemonId?: string }): Promise<SessionInfo | null>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
    input(sessionId: string, data: string): void;
    onData(callback: (sessionId: string, data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number) => void): () => void;
  };
  session: {
    list(): Promise<SessionInfo[]>;
    onStatusChanged(callback: (sessionId: string, status: SessionStatus) => void): () => void;
    onSessionCreated(callback: (session: SessionInfo) => void): () => void;
  };
  daemon: {
    add(config: { id: string; name: string; host: string; port: number; token: string; fingerprint: string; autoConnect: boolean }): Promise<void>;
    connect(daemonId: string): Promise<void>;
    disconnect(daemonId: string): Promise<void>;
    remove(daemonId: string): Promise<void>;
    statuses(): Promise<Array<{ id: string; name: string; status: string; sessionCount: number }>>;
    onStatusChanged(callback: (daemonId: string, name: string, status: string) => void): () => void;
    onConnected(callback: (daemonId: string, name: string) => void): () => void;
    pair(host: string, port: number, clientName: string): Promise<void>;
    submitCode(code: string): Promise<void>;
    onPairChallenge(callback: (daemonName: string) => void): () => void;
    onPairSuccess(callback: (name: string) => void): () => void;
    onPairFailed(callback: (reason: string) => void): () => void;
  };
  preferences: {
    load(): Promise<SwitchboardPreferences>;
    save(prefs: SwitchboardPreferences): Promise<void>;
    reset(): Promise<SwitchboardPreferences>;
    onChanged(callback: (prefs: SwitchboardPreferences) => void): () => void;
  };
}

declare global {
  interface Window {
    switchboard: SwitchboardAPI;
  }
}
