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
    spawn(config: { name: string; cwd: string; command?: string }) {
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
