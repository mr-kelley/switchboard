import * as https from 'https';
import type { TLSSocket, PeerCertificate } from 'tls';
import { WebSocketServer, WebSocket } from 'ws';
import {
  serializeMessage,
  deserializeMessage,
  SequenceCounter,
  type BaseMessage,
  type ClientMessage,
} from '../shared/protocol';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 60_000;

export interface TransportConfig {
  port: number;
  host: string;
  tls: {
    /** Server cert PEM. */
    cert: string;
    /** Server key PEM. */
    key: string;
    /** Lab CA root PEM (trust anchor for client-cert validation). */
    ca: string;
  };
  daemonId: string;
  hostname: string;
  version: string;
}

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  seq: SequenceCounter;
  lastPong: number;
  lastClientSeq: number;
  /**
   * SAN DNS FQDN extracted from the peer client certificate at handshake
   * completion. Load-bearing for per-message authorization (see
   * `specs/src/daemon/inject-api-spec.md`). Never null on an established
   * connection — the TLS layer rejects unauthenticated peers before we get
   * here.
   */
  clientIdentity: string;
}

export type MessageHandler = (conn: ClientConnection, msg: ClientMessage) => void;

/**
 * Extract the first SAN DNS entry from a peer certificate. Returns the
 * empty string if none is present — callers should treat that as a
 * misconfigured client cert and reject.
 */
function extractSanDns(cert: PeerCertificate): string {
  const san = (cert as { subjectaltname?: string }).subjectaltname;
  if (!san) return '';
  for (const entry of san.split(',')) {
    const trimmed = entry.trim();
    if (trimmed.startsWith('DNS:')) return trimmed.slice(4);
  }
  return '';
}

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
        this.server = https.createServer({
          cert: this.config.tls.cert,
          key: this.config.tls.key,
          ca: this.config.tls.ca,
          requestCert: true,
          rejectUnauthorized: true,
        });
        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req.socket as TLSSocket));

        this.server.listen(this.config.port, this.config.host, () => {
          this.startPingInterval();
          resolve();
        });

        this.server.on('error', reject);
        // Log TLS handshake failures loudly — otherwise they're silent on the
        // daemon side and clients get an opaque disconnect.
        this.server.on('tlsClientError', (err: Error, socket: TLSSocket) => {
          const peer = socket.remoteAddress ?? 'unknown';
          console.warn(`[tls] client from ${peer} rejected: ${err.message}`);
        });
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

  send(connId: string, msg: { type: string; [key: string]: unknown }): void {
    const conn = this.connections.get(connId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
    const full = { ...msg, seq: conn.seq.next() };
    conn.ws.send(serializeMessage(full as BaseMessage));
  }

  broadcast(msg: { type: string; [key: string]: unknown }): void {
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        const full = { ...msg, seq: conn.seq.next() };
        conn.ws.send(serializeMessage(full as BaseMessage));
      }
    }
  }

  getConnectedCount(): number {
    return this.connections.size;
  }

  private handleConnection(ws: WebSocket, socket: TLSSocket): void {
    const cert = socket.getPeerCertificate(true);
    const identity = extractSanDns(cert);

    // `requestCert:true` + `rejectUnauthorized:true` should mean no peer ever
    // reaches this callback without a validated client cert. Defensive check:
    // if the identity is empty (cert has no SAN DNS entry, or peer somehow got
    // through with no cert), close hard.
    if (!identity) {
      console.warn('[tls] peer connected without a usable SAN DNS identity; closing');
      ws.close(4003, 'Missing client identity');
      return;
    }

    const connId = `conn-${++this.connCounter}`;
    const conn: ClientConnection = {
      id: connId,
      ws,
      seq: new SequenceCounter(),
      lastPong: Date.now(),
      lastClientSeq: 0,
      clientIdentity: identity,
    };

    this.connections.set(connId, conn);
    console.log(`[conn] ${identity} connected (id=${connId})`);

    // Unsolicited connection-metadata message so the client learns the daemon's
    // identity + version without a challenge/response dance.
    this.send(connId, {
      type: 'auth:ok',
      daemonId: this.config.daemonId,
      hostname: this.config.hostname,
      version: this.config.version,
    });
    this.onConnect?.(conn);

    ws.on('message', (rawData) => {
      try {
        const raw = rawData.toString();
        const msg = deserializeMessage(raw) as ClientMessage;
        conn.lastClientSeq = msg.seq;

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
      this.connections.delete(connId);
      console.log(`[conn] ${identity} disconnected (id=${connId})`);
      this.onDisconnect?.(connId);
    });

    ws.on('error', (err) => {
      console.warn(`[conn] ${identity} error (id=${connId}): ${err.message}`);
      this.connections.delete(connId);
      this.onDisconnect?.(connId);
    });

    ws.on('pong', () => {
      conn.lastPong = Date.now();
    });
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [connId, conn] of this.connections) {
        if (now - conn.lastPong > PONG_TIMEOUT_MS) {
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
