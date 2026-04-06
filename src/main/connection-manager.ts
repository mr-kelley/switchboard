import { WebSocket } from 'ws';
import { BrowserWindow } from 'electron';
import {
  serializeMessage,
  deserializeMessage,
  SequenceCounter,
  type BaseMessage,
  type DaemonMessage,
  type SessionInfo,
} from '../shared/protocol';
import { notifyIfNeeded, isAppFocused } from './notifications';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting';

export interface DaemonConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
  fingerprint: string;
  autoConnect: boolean;
}

interface ManagedConnection {
  config: DaemonConnectionConfig;
  ws: WebSocket | null;
  status: ConnectionStatus;
  seq: SequenceCounter;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
  lastPong: number;
  sessions: Map<string, SessionInfo>;
  replayingSessions: Set<string>;
}

function broadcast(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send(channel, data);
  }
}

export class ConnectionManager {
  private connections = new Map<string, ManagedConnection>();

  /**
   * Add a daemon connection configuration. Does not connect immediately.
   */
  addConnection(config: DaemonConnectionConfig): void {
    if (this.connections.has(config.id)) return;
    this.connections.set(config.id, {
      config,
      ws: null,
      status: 'disconnected',
      seq: new SequenceCounter(),
      reconnectTimer: null,
      reconnectDelay: 1000,
      lastPong: Date.now(),
      sessions: new Map(),
      replayingSessions: new Set(),
    });
  }

  /**
   * Connect to a daemon.
   */
  connect(daemonId: string): void {
    const conn = this.connections.get(daemonId);
    if (!conn) throw new Error(`Unknown daemon: ${daemonId}`);
    if (conn.status === 'connected' || conn.status === 'connecting' || conn.status === 'authenticating') return;

    this.setStatus(conn, 'connecting');

    const ws = new WebSocket(`wss://${conn.config.host}:${conn.config.port}`, {
      rejectUnauthorized: false, // Self-signed certs; validated via fingerprint
    });

    conn.ws = ws;

    ws.on('open', () => {
      this.setStatus(conn, 'authenticating');
      this.sendToDaemon(conn, { type: 'auth', token: conn.config.token });
    });

    ws.on('message', (rawData) => {
      try {
        const msg = deserializeMessage(rawData.toString()) as DaemonMessage;
        this.handleDaemonMessage(conn, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      const wasConnected = conn.status === 'connected';
      conn.ws = null;
      if (wasConnected) {
        this.setStatus(conn, 'reconnecting');
        this.scheduleReconnect(conn);
      } else {
        this.setStatus(conn, 'disconnected');
      }
    });

    ws.on('error', () => {
      // Error is followed by close event
    });
  }

  /**
   * Disconnect from a daemon.
   */
  disconnect(daemonId: string): void {
    const conn = this.connections.get(daemonId);
    if (!conn) return;
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }
    if (conn.ws) {
      conn.ws.close(1000, 'Client disconnect');
      conn.ws = null;
    }
    this.setStatus(conn, 'disconnected');
  }

  /**
   * Remove a daemon connection entirely.
   */
  removeConnection(daemonId: string): void {
    this.disconnect(daemonId);
    this.connections.delete(daemonId);
  }

  /**
   * Connect to all auto-connect daemons.
   */
  connectAll(): void {
    for (const conn of this.connections.values()) {
      if (conn.config.autoConnect && conn.status === 'disconnected') {
        this.connect(conn.config.id);
      }
    }
  }

  /**
   * Disconnect all and clean up.
   */
  disconnectAll(): void {
    for (const conn of this.connections.values()) {
      this.disconnect(conn.config.id);
    }
  }

  /**
   * Get status of all connections.
   */
  getConnectionStatuses(): Array<{ id: string; name: string; status: ConnectionStatus; sessionCount: number }> {
    return Array.from(this.connections.values()).map((conn) => ({
      id: conn.config.id,
      name: conn.config.name,
      status: conn.status,
      sessionCount: conn.sessions.size,
    }));
  }

  /**
   * Get all sessions across all connected daemons. Session IDs are composite: daemonId:sessionId.
   */
  getAllSessions(): SessionInfo[] {
    const result: SessionInfo[] = [];
    for (const conn of this.connections.values()) {
      for (const session of conn.sessions.values()) {
        result.push({
          ...session,
          id: `${conn.config.id}:${session.id}`,
        });
      }
    }
    return result;
  }

  /**
   * Route a command to the appropriate daemon based on composite session ID.
   */
  private findConnection(compositeId: string): { conn: ManagedConnection; sessionId: string } | null {
    const colonIdx = compositeId.indexOf(':');
    if (colonIdx === -1) return null;
    const daemonId = compositeId.substring(0, colonIdx);
    const sessionId = compositeId.substring(colonIdx + 1);
    const conn = this.connections.get(daemonId);
    if (!conn) return null;
    return { conn, sessionId };
  }

  /**
   * Spawn a session on a specific daemon.
   */
  spawn(daemonId: string, name: string, cwd: string, command?: string): void {
    const conn = this.connections.get(daemonId);
    if (!conn || conn.status !== 'connected') throw new Error('Daemon not connected');
    this.sendToDaemon(conn, { type: 'session:spawn', name, cwd, command });
  }

  /**
   * Send input to a session (composite ID).
   */
  input(compositeId: string, data: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:input', sessionId: found.sessionId, data });
  }

  /**
   * Resize a session (composite ID).
   */
  resize(compositeId: string, cols: number, rows: number): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:resize', sessionId: found.sessionId, cols, rows });
  }

  /**
   * Close a session (composite ID).
   */
  close(compositeId: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:close', sessionId: found.sessionId });
  }

  /**
   * Rename a session (composite ID).
   */
  rename(compositeId: string, name: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:rename', sessionId: found.sessionId, name });
  }

  /**
   * Get the first connected daemon ID (convenience for single-daemon setups).
   */
  getDefaultDaemonId(): string | null {
    for (const conn of this.connections.values()) {
      if (conn.status === 'connected') return conn.config.id;
    }
    return null;
  }

  /**
   * Check if we have any daemon connections configured.
   */
  hasDaemons(): boolean {
    return this.connections.size > 0;
  }

  // --- Pairing ---

  private pairingWs: WebSocket | null = null;
  private pairingHost = '';
  private pairingPort = 0;
  private pairingTokenData: any = null;

  /**
   * Initiate pairing with a daemon. Opens a WebSocket, sends pair:request,
   * and waits for the daemon to issue a challenge.
   */
  async pair(host: string, port: number, clientName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${host}:${port}`, {
        rejectUnauthorized: false,
      });

      this.pairingWs = ws;
      this.pairingHost = host;
      this.pairingPort = port;
      this.pairingTokenData = null;

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'pair:request', seq: 1, clientName }));
      });

      ws.on('message', (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString());

          if (msg.type === 'pair:challenge') {
            broadcast('daemon:pair-challenge', {
              host, port,
              daemonName: msg.daemonName || msg.hostname,
            });
            resolve();
          } else if (msg.type === 'pair:token') {
            // Save token data — we'll use it when auth:ok arrives
            this.pairingTokenData = msg;
          } else if (msg.type === 'auth:ok') {
            // Pairing + auth complete on this WS — promote it to a managed connection
            if (this.pairingTokenData) {
              this.promotePairingConnection(host, port, ws, this.pairingTokenData, msg);
            }
          } else if (msg.type === 'pair:fail') {
            broadcast('daemon:pair-failed', { reason: msg.reason });
            ws.close();
          }
        } catch {
          // Ignore
        }
      });

      ws.on('error', (err) => {
        this.pairingWs = null;
        reject(new Error(`Failed to connect to ${host}:${port}: ${err.message}`));
      });

      // Only clean up pairingWs ref if the WS wasn't promoted
      ws.on('close', () => {
        if (this.pairingWs === ws) {
          this.pairingWs = null;
        }
      });
    });
  }

  /**
   * Submit the pairing code entered by the user.
   */
  submitPairingCode(code: string): void {
    if (!this.pairingWs || this.pairingWs.readyState !== WebSocket.OPEN) {
      broadcast('daemon:pair-failed', { reason: 'No pairing in progress' });
      return;
    }
    this.pairingWs.send(JSON.stringify({ type: 'pair:response', seq: 2, code }));
  }

  /**
   * Promote the pairing WebSocket to a full managed connection.
   * This avoids opening a second WS — the pairing WS is already authenticated.
   */
  private promotePairingConnection(host: string, port: number, ws: WebSocket, tokenData: any, authOk: any): void {
    const config: DaemonConnectionConfig = {
      id: tokenData.daemonId || `daemon-${Date.now()}`,
      name: tokenData.hostname || `${host}:${port}`,
      host,
      port,
      token: tokenData.token,
      fingerprint: tokenData.fingerprint || '',
      autoConnect: true,
    };

    console.log(`[pairing] Promoting pairing WS to managed connection ${config.id} (${config.name})`);

    // Clear pairing state
    this.pairingWs = null;
    this.pairingTokenData = null;

    // Create the managed connection with the existing WS
    const conn: ManagedConnection = {
      config,
      ws,
      status: 'connected',
      seq: new SequenceCounter(),
      reconnectTimer: null,
      reconnectDelay: 1000,
      lastPong: Date.now(),
      sessions: new Map(),
      replayingSessions: new Set(),
    };

    this.connections.set(config.id, conn);

    // Re-wire the WS message handler to use the managed connection's handler
    ws.removeAllListeners('message');
    ws.removeAllListeners('close');
    ws.removeAllListeners('error');

    ws.on('message', (rawData) => {
      try {
        const msg = deserializeMessage(rawData.toString()) as DaemonMessage;
        this.handleDaemonMessage(conn, msg);
      } catch {
        // Ignore
      }
    });

    ws.on('close', () => {
      const wasConnected = conn.status === 'connected';
      conn.ws = null;
      if (wasConnected) {
        this.setStatus(conn, 'reconnecting');
        this.scheduleReconnect(conn);
      } else {
        this.setStatus(conn, 'disconnected');
      }
    });

    ws.on('error', () => {});

    ws.on('pong', () => {
      conn.lastPong = Date.now();
    });

    // Broadcast connected status
    broadcast('daemon:connected', { daemonId: config.id, name: config.name });
    broadcast('daemon:pair-success', { name: config.name });
    this.setStatus(conn, 'connected');

    // Request session list (the daemon already sent it after auth:ok,
    // but our handler wasn't wired yet — request it again)
    this.sendToDaemon(conn, { type: 'session:list' });
  }

  // --- Message handling ---

  private handleDaemonMessage(conn: ManagedConnection, msg: DaemonMessage): void {
    switch (msg.type) {
      case 'auth:ok':
        this.setStatus(conn, 'connected');
        conn.reconnectDelay = 1000; // Reset backoff
        broadcast('daemon:connected', { daemonId: conn.config.id, name: conn.config.name });
        break;

      case 'auth:fail':
        this.setStatus(conn, 'disconnected');
        broadcast('daemon:auth-failed', { daemonId: conn.config.id, reason: msg.reason });
        break;

      case 'session:list':
        conn.sessions.clear();
        for (const session of msg.sessions) {
          conn.sessions.set(session.id, session);
          // Emit individual session-created events so the renderer picks them up
          const compositeId = `${conn.config.id}:${session.id}`;
          broadcast('daemon:session-created', {
            ...session,
            id: compositeId,
            daemonId: conn.config.id,
            daemonName: conn.config.name,
          });
        }
        break;

      case 'session:created': {
        const session = msg.session;
        conn.sessions.set(session.id, session);
        const compositeId = `${conn.config.id}:${session.id}`;
        broadcast('daemon:session-created', {
          ...session,
          id: compositeId,
          daemonId: conn.config.id,
          daemonName: conn.config.name,
        });
        break;
      }

      case 'session:closed': {
        conn.sessions.delete(msg.sessionId);
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('pty:exit', { sessionId: compositeId, exitCode: msg.exitCode ?? 0 });
        break;
      }

      case 'session:data': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('pty:data', { sessionId: compositeId, data: msg.data });
        break;
      }

      case 'session:status': {
        const session = conn.sessions.get(msg.sessionId);
        if (session) {
          session.status = msg.status as SessionInfo['status'];
          // Fire notification if needs-attention
          if (msg.status === 'needs-attention') {
            notifyIfNeeded(session.name, isAppFocused());
          }
        }
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('session:status-changed', { sessionId: compositeId, status: msg.status });
        break;
      }

      case 'session:renamed': {
        const session = conn.sessions.get(msg.sessionId);
        if (session) session.name = msg.name;
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('session:renamed', { sessionId: compositeId, name: msg.name });
        break;
      }

      case 'replay:begin': {
        conn.replayingSessions.add(msg.sessionId);
        break;
      }

      case 'replay:data': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('pty:data', { sessionId: compositeId, data: msg.data });
        break;
      }

      case 'replay:end': {
        conn.replayingSessions.delete(msg.sessionId);
        break;
      }

      case 'pong':
        // Keepalive acknowledged
        break;

      case 'error':
        console.warn(`Daemon ${conn.config.name} error: [${msg.code}] ${msg.message}`);
        break;
    }
  }

  // --- Internal helpers ---

  private sendToDaemon(conn: ManagedConnection, msg: { type: string; [key: string]: unknown }): void {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    const full = { ...msg, seq: conn.seq.next() };
    conn.ws.send(serializeMessage(full as BaseMessage));
  }

  private setStatus(conn: ManagedConnection, status: ConnectionStatus): void {
    conn.status = status;
    broadcast('daemon:status-changed', {
      daemonId: conn.config.id,
      name: conn.config.name,
      status,
    });
  }

  private scheduleReconnect(conn: ManagedConnection): void {
    if (conn.reconnectTimer) return;
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (conn.status === 'reconnecting') {
        conn.reconnectDelay = Math.min(conn.reconnectDelay * 2, 30_000);
        this.connect(conn.config.id);
      }
    }, conn.reconnectDelay);
  }
}
