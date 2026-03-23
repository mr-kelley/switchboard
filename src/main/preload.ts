import { contextBridge, ipcRenderer } from 'electron';

const api = {
  platform: process.platform,
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
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
