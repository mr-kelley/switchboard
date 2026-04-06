import * as https from 'https';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { validateToken } from './auth';
import {
  serializeMessage,
  deserializeMessage,
  SequenceCounter,
  type BaseMessage,
  type ClientMessage,
  type DaemonMessage,
  type SessionInfo,
} from '../shared/protocol';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 60_000;
const AUTH_TIMEOUT_MS = 5_000;

export interface TransportConfig {
  port: number;
  host: string;
  tls: {
    cert: string;
    key: string;
  };
  token: string;
  daemonId: string;
  hostname: string;
  version: string;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  seq: SequenceCounter;
  lastPong: number;
  lastClientSeq: number;
}

export type MessageHandler = (conn: ClientConnection, msg: ClientMessage) => void;

export class TransportServer {
  private server: https.Server | null = null;
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, ClientConnection>();
  private config: TransportConfig;
  private onMessage: MessageHandler;
  private onConnect?: (conn: ClientConnection) => void;
  private onDisconnect?: (connId: string) => void;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connCounter = 0;

  constructor(config: TransportConfig, onMessage: MessageHandler) {
    this.config = config;
    this.onMessage = onMessage;
  }

  setOnConnect(handler: (conn: ClientConnection) => void): void {
    this.onConnect = handler;
  }

  setOnDisconnect(handler: (connId: string) => void): void {
    this.onDisconnect = handler;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const tlsOptions = {
          cert: fs.readFileSync(this.config.tls.cert, 'utf-8'),
          key: fs.readFileSync(this.config.tls.key, 'utf-8'),
        };

        this.server = https.createServer(tlsOptions);
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws) => this.handleConnection(ws));

        this.server.listen(this.config.port, this.config.host, () => {
          this.startPingInterval();
          resolve();
        });

        this.server.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      // Close all connections
      for (const conn of this.connections.values()) {
        try {
          conn.ws.close(1001, 'Server shutting down');
        } catch {
          // Ignore
        }
      }
      this.connections.clear();

      if (this.wss) {
        this.wss.close(() => {
          if (this.server) {
            this.server.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Send a message to a specific client. The seq field is added automatically.
   */
  send(connId: string, msg: { type: string; [key: string]: unknown }): void {
    const conn = this.connections.get(connId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
    const full = { ...msg, seq: conn.seq.next() };
    conn.ws.send(serializeMessage(full as BaseMessage));
  }

  /**
   * Broadcast a message to all authenticated clients.
   */
  broadcast(msg: { type: string; [key: string]: unknown }): void {
    for (const conn of this.connections.values()) {
      if (conn.authenticated && conn.ws.readyState === WebSocket.OPEN) {
        const full = { ...msg, seq: conn.seq.next() };
        conn.ws.send(serializeMessage(full as BaseMessage));
      }
    }
  }

  getConnectedCount(): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.authenticated) count++;
    }
    return count;
  }

  private handleConnection(ws: WebSocket): void {
    const connId = `conn-${++this.connCounter}`;
    const conn: ClientConnection = {
      id: connId,
      ws,
      authenticated: false,
      seq: new SequenceCounter(),
      lastPong: Date.now(),
      lastClientSeq: 0,
    };

    this.connections.set(connId, conn);

    // Auth timeout — disconnect if not authenticated within AUTH_TIMEOUT_MS
    const authTimer = setTimeout(() => {
      if (!conn.authenticated) {
        this.send(connId, { type: 'auth:fail', reason: 'Authentication timeout' });
        ws.close(4001, 'Auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (rawData) => {
      try {
        const raw = rawData.toString();
        const msg = deserializeMessage(raw) as ClientMessage;
        conn.lastClientSeq = msg.seq;

        if (!conn.authenticated) {
          if (msg.type === 'auth') {
            clearTimeout(authTimer);
            this.handleAuth(conn, msg.token);
          } else {
            this.send(connId, { type: 'auth:fail', reason: 'Must authenticate first' });
            ws.close(4001, 'Not authenticated');
          }
          return;
        }

        if (msg.type === 'ping') {
          this.send(connId, { type: 'pong' });
          return;
        }

        this.onMessage(conn, msg);
      } catch (err) {
        this.send(connId, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: err instanceof Error ? err.message : 'Invalid message',
        });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      this.connections.delete(connId);
      this.onDisconnect?.(connId);
    });

    ws.on('error', () => {
      clearTimeout(authTimer);
      this.connections.delete(connId);
      this.onDisconnect?.(connId);
    });

    ws.on('pong', () => {
      conn.lastPong = Date.now();
    });
  }

  private handleAuth(conn: ClientConnection, token: string): void {
    if (validateToken(token, this.config.token)) {
      conn.authenticated = true;
      this.send(conn.id, {
        type: 'auth:ok',
        daemonId: this.config.daemonId,
        hostname: this.config.hostname,
        version: this.config.version,
      });
      this.onConnect?.(conn);
    } else {
      // Brief delay to prevent timing attacks on auth failure
      setTimeout(() => {
        this.send(conn.id, { type: 'auth:fail', reason: 'Invalid token' });
        conn.ws.close(4003, 'Auth failed');
      }, 200);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [connId, conn] of this.connections) {
        if (!conn.authenticated) continue;
        if (now - conn.lastPong > PONG_TIMEOUT_MS) {
          // Dead connection
          conn.ws.terminate();
          this.connections.delete(connId);
          this.onDisconnect?.(connId);
        } else {
          conn.ws.ping();
        }
      }
    }, PING_INTERVAL_MS);
  }
}
