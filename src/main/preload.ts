import { contextBridge, ipcRenderer } from 'electron';

const api = {
  platform: process.platform,
  dialog: {
    openFile(filters?: Array<{ name: string; extensions: string[] }>) {
      return ipcRenderer.invoke('dialog:open-file', filters ? { filters } : undefined);
    },
  },
  onCycleTab(callback: (shift: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, args: { shift: boolean }) => {
      callback(args.shift);
    };
    ipcRenderer.on('shortcut:cycle-tab', handler);
    return () => ipcRenderer.removeListener('shortcut:cycle-tab', handler);
  },
  pty: {
    spawn(config: { name: string; cwd: string; command?: string; daemonId?: string }) {
      return ipcRenderer.invoke('pty:spawn', config);
    },
    resize(sessionId: string, cols: number, rows: number) {
      return ipcRenderer.invoke('pty:resize', { sessionId, cols, rows });
    },
    close(sessionId: string) {
      return ipcRenderer.invoke('pty:close', { sessionId });
    },
    input(sessionId: string, data: string) {
      ipcRenderer.send('pty:input', { sessionId, data });
    },
    onData(callback: (sessionId: string, data: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { sessionId: string; data: string }) => {
        callback(args.sessionId, args.data);
      };
      ipcRenderer.on('pty:data', handler);
      return () => ipcRenderer.removeListener('pty:data', handler);
    },
    onExit(callback: (sessionId: string, exitCode: number) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { sessionId: string; exitCode: number }) => {
        callback(args.sessionId, args.exitCode);
      };
      ipcRenderer.on('pty:exit', handler);
      return () => ipcRenderer.removeListener('pty:exit', handler);
    },
  },
  session: {
    list() {
      return ipcRenderer.invoke('session:list');
    },
    onStatusChanged(callback: (sessionId: string, status: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { sessionId: string; status: string }) => {
        callback(args.sessionId, args.status);
      };
      ipcRenderer.on('session:status-changed', handler);
      return () => ipcRenderer.removeListener('session:status-changed', handler);
    },
    onSessionCreated(callback: (session: any) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, session: any) => {
        callback(session);
      };
      ipcRenderer.on('daemon:session-created', handler);
      return () => ipcRenderer.removeListener('daemon:session-created', handler);
    },
  },
  daemon: {
    add(config: { id: string; name: string; host: string; port: number; token: string; fingerprint: string; autoConnect: boolean }) {
      return ipcRenderer.invoke('daemon:add', config);
    },
    connect(daemonId: string) {
      return ipcRenderer.invoke('daemon:connect', daemonId);
    },
    disconnect(daemonId: string) {
      return ipcRenderer.invoke('daemon:disconnect', daemonId);
    },
    remove(daemonId: string) {
      return ipcRenderer.invoke('daemon:remove', daemonId);
    },
    statuses() {
      return ipcRenderer.invoke('daemon:statuses');
    },
    onStatusChanged(callback: (daemonId: string, name: string, status: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { daemonId: string; name: string; status: string }) => {
        callback(args.daemonId, args.name, args.status);
      };
      ipcRenderer.on('daemon:status-changed', handler);
      return () => ipcRenderer.removeListener('daemon:status-changed', handler);
    },
    onConnected(callback: (daemonId: string, name: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { daemonId: string; name: string }) => {
        callback(args.daemonId, args.name);
      };
      ipcRenderer.on('daemon:connected', handler);
      return () => ipcRenderer.removeListener('daemon:connected', handler);
    },
    pair(host: string, port: number, clientName: string) {
      return ipcRenderer.invoke('daemon:pair', { host, port, clientName });
    },
    submitCode(code: string) {
      return ipcRenderer.invoke('daemon:submit-code', code);
    },
    onPairChallenge(callback: (daemonName: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { daemonName: string }) => {
        callback(args.daemonName);
      };
      ipcRenderer.on('daemon:pair-challenge', handler);
      return () => ipcRenderer.removeListener('daemon:pair-challenge', handler);
    },
    onPairSuccess(callback: (name: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { name: string }) => {
        callback(args.name);
      };
      ipcRenderer.on('daemon:pair-success', handler);
      return () => ipcRenderer.removeListener('daemon:pair-success', handler);
    },
    onPairFailed(callback: (reason: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, args: { reason: string }) => {
        callback(args.reason);
      };
      ipcRenderer.on('daemon:pair-failed', handler);
      return () => ipcRenderer.removeListener('daemon:pair-failed', handler);
    },
  },
  preferences: {
    load() {
      return ipcRenderer.invoke('preferences:load');
    },
    save(prefs: Record<string, unknown>) {
      return ipcRenderer.invoke('preferences:save', prefs);
    },
    reset() {
      return ipcRenderer.invoke('preferences:reset');
    },
    onChanged(callback: (prefs: Record<string, unknown>) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, prefs: Record<string, unknown>) => {
        callback(prefs);
      };
      ipcRenderer.on('preferences:changed', handler);
      return () => ipcRenderer.removeListener('preferences:changed', handler);
    },
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
