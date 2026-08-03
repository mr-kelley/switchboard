export type SessionStatus = 'working' | 'idle' | 'needs-attention';

export type NotificationPriority = 'high' | 'normal' | 'silent';

export interface SessionTemplate {
  id: string;
  name: string;
  daemonId: string;
  cwd: string;
  command?: string;
}

export interface SessionGroup {
  name: string;
  collapsed: boolean;
  sessionIds: string[];
}

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

export interface DaemonConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  autoConnect: boolean;
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
  daemonConnections: DaemonConnectionConfig[];
  notificationPriorities: Record<string, NotificationPriority>;
  sessionTemplates: SessionTemplate[];
  sessionGroups: Record<string, SessionGroup>;
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
    queuePrompt(sessionId: string, text: string): Promise<void>;
    clearQueue(sessionId: string): Promise<void>;
    setPriority(sessionId: string, priority: NotificationPriority): Promise<void>;
    onFocusAttention(callback: () => void): () => void;
    onQueueUpdated(callback: (sessionId: string, text: string | null) => void): () => void;
    onQueueRejected(callback: (sessionId: string, reason: string) => void): () => void;
    onQueueSync(callback: (queuedPrompts: Record<string, string>) => void): () => void;
  };
  daemon: {
    add(config: { id: string; name: string; host: string; port: number; autoConnect: boolean }): Promise<void>;
    addAndConnect(host: string, port: number, name: string): Promise<string>;
    connect(daemonId: string): Promise<void>;
    disconnect(daemonId: string): Promise<void>;
    remove(daemonId: string): Promise<void>;
    statuses(): Promise<Array<{ id: string; name: string; status: string; sessionCount: number }>>;
    onStatusChanged(callback: (daemonId: string, name: string, status: string) => void): () => void;
    onConnected(callback: (daemonId: string, name: string) => void): () => void;
    onError(callback: (err: { daemonId: string; daemonName: string; code: string; message: string }) => void): () => void;
    localService: {
      status(): Promise<{ installed: boolean; running: boolean; pid?: number; installBlocked?: boolean; installBlockedReason?: string }>;
      install(): Promise<{ ok: boolean; message?: string }>;
      uninstall(): Promise<{ ok: boolean; message?: string }>;
    };
  };
  desktopIntegration: {
    status(): Promise<DesktopIntegrationStatus>;
    uninstall(): Promise<{ removed: boolean; status: DesktopIntegrationStatus }>;
  };
  remoteProvision: {
    start(req: RemoteProvisionRequest): Promise<void>;
    cancel(): Promise<void>;
    retryFrom(step: RemoteProvisionStepId): Promise<void>;
    onProgress(callback: (state: RemoteProvisionStepState[]) => void): () => void;
  };
  preferences: {
    load(): Promise<SwitchboardPreferences>;
    save(prefs: SwitchboardPreferences): Promise<void>;
    reset(): Promise<SwitchboardPreferences>;
    onChanged(callback: (prefs: SwitchboardPreferences) => void): () => void;
  };
}

export interface DesktopIntegrationStatus {
  supported: boolean;
  installed: boolean;
  appImagePath: string | null;
  desktopPath: string;
}

export type RemoteProvisionStepId =
  | 'test-connection' | 'probe-target' | 'check-existing'
  | 'upload-tarball' | 'upload-certs'
  | 'extract' | 'install-service' | 'wait-ready'
  | 'connect-client' | 'cleanup';

export type RemoteProvisionStepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface RemoteProvisionStepState {
  id: RemoteProvisionStepId;
  label: string;
  status: RemoteProvisionStepStatus;
  message?: string;
  errorKind?: string;
  errorDetail?: string;
}

export interface RemoteProvisionTarget {
  host: string;
  user: string;
  port: number;
  identityFile?: string;
}

export interface RemoteProvisionRequest {
  target: RemoteProvisionTarget;
  daemonName?: string;
  daemonPort: number;
  certs: {
    serverCertPath: string;
    serverKeyPath: string;
    caCertPath: string;
  };
}

declare global {
  interface Window {
    switchboard: SwitchboardAPI;
  }
}
