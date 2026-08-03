import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
import type { DaemonConnectionConfig, NotificationPriority } from '../shared/types';
import { LOCALHOST_DAEMON_ID } from './local-daemon';
import type { PreferencesStore } from './preferences-store';

export type { DaemonConnectionConfig } from '../shared/types';

// Handshake completes fast; "authenticating" is retained as a status name so
// existing UI status-color logic keeps working, but under mTLS it's a
// transient state between socket 'open' and the daemon's unsolicited auth:ok
// metadata message.
export type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting';

interface ClientCertBundle {
  cert: string;
  key: string;
  ca: string;
}

let cachedBundle: ClientCertBundle | Error | null = null;

/**
 * Load the client's own cert + key + the lab CA root. Same well-known-path
 * pattern as the daemon: `SWITCHBOARD_TLS_DIR` env → `~/.switchboard/tls/`.
 * Cached across the process lifetime; a broken load caches the error so
 * repeated connection attempts don't spam the filesystem.
 */
function loadClientCertBundle(): ClientCertBundle {
  if (cachedBundle instanceof Error) throw cachedBundle;
  if (cachedBundle) return cachedBundle;

  const dir = process.env.SWITCHBOARD_TLS_DIR || path.join(os.homedir(), '.switchboard', 'tls');
  const read = (name: string): string => {
    const p = path.join(dir, name);
    try {
      const body = fs.readFileSync(p, 'utf-8');
      if (!body.includes('-----BEGIN')) {
        throw new Error(`${p} exists but is not a PEM file`);
      }
      return body;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        throw new Error(
          `TLS file missing: ${p}. The client needs a lab-CA-signed client cert + key + the CA root at ${dir}. ` +
            `See specs/src/daemon/transport-mtls-spec.md.`
        );
      }
      throw err;
    }
  };
  try {
    const bundle: ClientCertBundle = {
      cert: read('client.crt'),
      key: read('client.key'),
      ca: read('ca.crt'),
    };
    cachedBundle = bundle;
    return bundle;
  } catch (err) {
    cachedBundle = err as Error;
    throw err;
  }
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

/**
 * URL-safe host: wraps bare IPv6 literals in brackets so `${host}:${port}` in
 * a `wss://` URL parses unambiguously. Hostnames and IPv4 pass through
 * unchanged; already-bracketed IPv6 (e.g., `[::1]`) also passes through.
 */
function bracketHost(host: string): string {
  if (host.startsWith('[')) return host;
  return host.includes(':') ? `[${host}]` : host;
}

export interface AttentionSummary {
  total: number;
  perDaemon: Array<{
    id: string;
    name: string;
    status: ConnectionStatus;
    sessionCount: number;
    attentionCount: number;
  }>;
}

export class ConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  private prefsStore: PreferencesStore | undefined;
  private attentionListeners = new Set<() => void>();

  constructor(prefsStore?: PreferencesStore) {
    this.prefsStore = prefsStore;
  }

  /**
   * Persist all non-localhost daemon configs to preferences so they survive
   * client restarts. Localhost is re-added by local-daemon auto-start each
   * launch, so it doesn't belong in prefs.
   */
  private persistConnections(): void {
    if (!this.prefsStore) return;
    const prefs = this.prefsStore.load();
    const configs = Array.from(this.connections.values())
      .map((c) => c.config)
      .filter((c) => c.id !== LOCALHOST_DAEMON_ID);
    this.prefsStore.save({ ...prefs, daemonConnections: configs });
  }

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

    let bundle: ClientCertBundle;
    try {
      bundle = loadClientCertBundle();
    } catch (err) {
      this.setStatus(conn, 'disconnected');
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[conn] ${conn.config.name}: cannot load client TLS bundle — ${message}`);
      broadcast('daemon:error', {
        daemonId: conn.config.id,
        daemonName: conn.config.name,
        code: 'CLIENT_TLS_MISSING',
        message,
      });
      return;
    }

    this.setStatus(conn, 'connecting');

    const ws = new WebSocket(`wss://${bracketHost(conn.config.host)}:${conn.config.port}`, {
      cert: bundle.cert,
      key: bundle.key,
      ca: bundle.ca,
      // rejectUnauthorized defaults to true; we intentionally do NOT override.
    });

    conn.ws = ws;

    ws.on('open', () => {
      // mTLS handshake completed. Daemon will send an unsolicited auth:ok with
      // its identity metadata almost immediately; we transition to 'connected'
      // there. Sit in 'authenticating' for the brief window until that arrives.
      this.setStatus(conn, 'authenticating');
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

    ws.on('error', (err) => {
      console.error(`[conn] ${conn.config.name} WS error:`, err.message);
      // Close event follows and handles state transition.
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
    this.persistConnections();
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
   * Aggregate count of needs-attention sessions across all daemons, with a
   * per-daemon breakdown. Disconnected daemons are still represented.
   */
  getAttentionSummary(): AttentionSummary {
    let total = 0;
    const perDaemon = Array.from(this.connections.values()).map((conn) => {
      let attentionCount = 0;
      for (const session of conn.sessions.values()) {
        if (session.status === 'needs-attention') attentionCount++;
      }
      total += attentionCount;
      return {
        id: conn.config.id,
        name: conn.config.name,
        status: conn.status,
        sessionCount: conn.sessions.size,
        attentionCount,
      };
    });
    return { total, perDaemon };
  }

  /**
   * Subscribe to changes that may affect the attention summary (session
   * status/create/close, daemon connect/disconnect). Returns an unsubscribe
   * function. Listener errors are isolated and never break message processing.
   */
  onAttentionChange(listener: () => void): () => void {
    this.attentionListeners.add(listener);
    return () => {
      this.attentionListeners.delete(listener);
    };
  }

  private notifyAttentionListeners(): void {
    for (const listener of this.attentionListeners) {
      try {
        listener();
      } catch (err) {
        console.error('Attention listener error:', err);
      }
    }
  }

  private resolvePriority(compositeId: string): NotificationPriority {
    if (!this.prefsStore) return 'normal';
    try {
      const prefs = this.prefsStore.load();
      return prefs.notificationPriorities?.[compositeId] ?? 'normal';
    } catch {
      return 'normal';
    }
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
    if (!conn) {
      const known = Array.from(this.connections.keys());
      console.error(`[spawn] no connection for daemonId=${JSON.stringify(daemonId)}. Known: ${JSON.stringify(known)}`);
      throw new Error(`Daemon not connected: unknown daemonId ${daemonId} (known: ${known.join(', ') || 'none'})`);
    }
    if (conn.status !== 'connected') {
      console.error(`[spawn] daemon ${conn.config.name} status=${conn.status} wsReadyState=${conn.ws?.readyState}`);
      throw new Error(`Daemon not connected: ${conn.config.name} is ${conn.status}`);
    }
    if (!conn.ws || conn.ws.readyState !== 1 /* OPEN */) {
      console.error(`[spawn] daemon ${conn.config.name} status='connected' but ws is ${conn.ws?.readyState}`);
      throw new Error(`Daemon not connected: ${conn.config.name} socket dropped`);
    }
    console.log(`[spawn] → ${conn.config.name}: name=${JSON.stringify(name)} cwd=${cwd} command=${command ? JSON.stringify(command) : '(default shell)'}`);
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

  queuePrompt(compositeId: string, text: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:queue-prompt', sessionId: found.sessionId, text });
  }

  clearQueue(compositeId: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:clear-queue', sessionId: found.sessionId });
  }

  requestReplay(compositeId: string): void {
    const found = this.findConnection(compositeId);
    if (!found) return;
    this.sendToDaemon(found.conn, { type: 'session:replay-request', sessionId: found.sessionId });
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

  /**
   * Register a new daemon connection from operator input (host + port) and
   * connect. Under mTLS there is no pairing dance: the client presents its
   * cert, the daemon presents its cert, both sides validate against the lab
   * CA, and the connection either succeeds or fails at the TLS layer.
   * The daemon's identity (daemonId, hostname) arrives via the unsolicited
   * `auth:ok` metadata message, which upgrades this provisional config.
   */
  addAndConnect(host: string, port: number, displayName: string): string {
    // Provisional id — will be replaced with the daemon's real daemonId when
    // auth:ok arrives, so persistence uses stable identity.
    const provisionalId = `pending:${host}:${port}:${Date.now()}`;
    const config: DaemonConnectionConfig = {
      id: provisionalId,
      name: displayName || `${host}:${port}`,
      host,
      port,
      autoConnect: true,
    };
    this.addConnection(config);
    this.connect(provisionalId);
    return provisionalId;
  }

  // --- Message handling ---

  private handleDaemonMessage(conn: ManagedConnection, msg: DaemonMessage): void {
    switch (msg.type) {
      case 'auth:ok': {
        // Unsolicited daemon metadata sent after the mTLS handshake completes.
        // No credential is checked here; this is the moment we learn the
        // daemon's stable identity (daemonId + hostname).
        // If this connection was added via addAndConnect() with a provisional
        // id, promote it to the real daemonId now so persistence is stable.
        if (conn.config.id.startsWith('pending:') && msg.daemonId) {
          this.rekeyConnection(conn, msg.daemonId, msg.hostname);
        }
        this.setStatus(conn, 'connected');
        conn.reconnectDelay = 1000;
        broadcast('daemon:connected', { daemonId: conn.config.id, name: conn.config.name });
        this.persistConnections();
        break;
      }

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
        this.notifyAttentionListeners();
        // Re-broadcast the queue snapshot as composite-keyed to the renderer
        if (msg.queuedPrompts) {
          const composite: Record<string, string> = {};
          for (const [sid, text] of Object.entries(msg.queuedPrompts)) {
            composite[`${conn.config.id}:${sid}`] = text;
          }
          broadcast('session:queue-sync', { queuedPrompts: composite });
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
        this.notifyAttentionListeners();
        break;
      }

      case 'session:closed': {
        conn.sessions.delete(msg.sessionId);
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('pty:exit', { sessionId: compositeId, exitCode: msg.exitCode ?? 0 });
        this.notifyAttentionListeners();
        break;
      }

      case 'session:data': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('pty:data', { sessionId: compositeId, data: msg.data });
        break;
      }

      case 'session:status': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        const session = conn.sessions.get(msg.sessionId);
        if (session) {
          session.status = msg.status as SessionInfo['status'];
          // Fire notification if needs-attention, honoring per-session priority.
          // Status broadcast + tray accounting happen regardless of priority.
          if (msg.status === 'needs-attention') {
            notifyIfNeeded(session.name, isAppFocused(), this.resolvePriority(compositeId));
          }
        }
        broadcast('session:status-changed', { sessionId: compositeId, status: msg.status });
        this.notifyAttentionListeners();
        break;
      }

      case 'session:queue-updated': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('session:queue-updated', { sessionId: compositeId, text: msg.text });
        break;
      }

      case 'session:queue-rejected': {
        const compositeId = `${conn.config.id}:${msg.sessionId}`;
        broadcast('session:queue-rejected', { sessionId: compositeId, reason: msg.reason });
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
        broadcast('daemon:error', {
          daemonId: conn.config.id,
          daemonName: conn.config.name,
          code: (msg as { code?: string }).code ?? 'ERROR',
          message: (msg as { message?: string }).message ?? '',
        });
        break;
    }
  }

  // --- Internal helpers ---

  private sendToDaemon(conn: ManagedConnection, msg: { type: string; [key: string]: unknown }): void {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;
    const full = { ...msg, seq: conn.seq.next() };
    conn.ws.send(serializeMessage(full as BaseMessage));
  }

  /**
   * Promote a provisional connection (id starts with 'pending:') to the
   * daemon's real daemonId once auth:ok is received. Preserves the WS and
   * all in-flight state; just rekeys the connections map.
   */
  private rekeyConnection(conn: ManagedConnection, realId: string, hostname: string): void {
    if (this.connections.has(realId) && this.connections.get(realId) !== conn) {
      // A prior connection to the same daemon already exists; drop the old one.
      const existing = this.connections.get(realId)!;
      this.connections.delete(realId);
      if (existing.ws) {
        try { existing.ws.close(1000, 'Superseded'); } catch { /* ignore */ }
      }
    }
    const oldId = conn.config.id;
    this.connections.delete(oldId);
    conn.config = { ...conn.config, id: realId, name: hostname || conn.config.name };
    this.connections.set(realId, conn);
    console.log(`[conn] rekeyed ${oldId} → ${realId} (${conn.config.name})`);
  }

  private setStatus(conn: ManagedConnection, status: ConnectionStatus): void {
    if (conn.status !== status) {
      console.log(`[conn] ${conn.config.name} (${conn.config.id}): ${conn.status} → ${status}`);
    }
    conn.status = status;
    broadcast('daemon:status-changed', {
      daemonId: conn.config.id,
      name: conn.config.name,
      status,
    });
    this.notifyAttentionListeners();
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
