import * as os from 'os';
import { randomUUID } from 'crypto';
import { loadConfig, getCertFingerprint } from './config';
import { PtyManager } from './pty-manager';
import { IdleDetector } from './idle-detector';
import { OutputBuffer } from './output-buffer';
import { SessionStore } from './session-store';
import { QueuedPrompts } from './queued-prompts';
import { TransportServer, type ClientConnection } from './transport';
import type { ClientMessage, SessionInfo } from '../shared/protocol';

const VERSION = '0.3.0-dev';

export class Daemon {
  private ptyManager: PtyManager;
  private idleDetector: IdleDetector;
  private buffers = new Map<string, OutputBuffer>();
  private sessionStore: SessionStore;
  private queuedPrompts: QueuedPrompts;
  private transport: TransportServer;
  private config: ReturnType<typeof loadConfig>;
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);

    this.sessionStore = new SessionStore(this.config.sessionPersistPath);
    this.queuedPrompts = new QueuedPrompts(this.config.sessionPersistPath);

    // Idle detector fires status changes → broadcast to clients; fire queued prompts
    // on transition into needs-attention.
    this.idleDetector = new IdleDetector((sessionId, status) => {
      this.ptyManager.updateStatus(sessionId, status);
      this.transport.broadcast({
        type: 'session:status',
        sessionId,
        status,
      });

      if (status === 'needs-attention') {
        const queued = this.queuedPrompts.consume(sessionId);
        if (queued) {
          try {
            this.idleDetector.onInput(sessionId);
            this.ptyManager.write(sessionId, queued + '\r');
          } catch {
            // Session may have been closed before we got here
          }
          this.transport.broadcast({
            type: 'session:queue-updated',
            sessionId,
            text: null,
          });
        }
      }
    });

    // PTY manager
    this.ptyManager = new PtyManager();

    this.ptyManager.setOnData((sessionId, data) => {
      // Feed idle detector
      this.idleDetector.onOutput(sessionId, data);
      // Append to output buffer
      const buf = this.buffers.get(sessionId);
      if (buf) buf.append(data);
      // Stream to all connected clients
      this.transport.broadcast({
        type: 'session:data',
        sessionId,
        data,
      });
    });

    this.ptyManager.setOnExit((sessionId, exitCode) => {
      this.idleDetector.removeSession(sessionId);
      this.queuedPrompts.removeSession(sessionId);
      this.transport.broadcast({
        type: 'session:closed',
        sessionId,
        exitCode,
      });
      // Keep buffer for a short period, then clean up
      setTimeout(() => {
        const buf = this.buffers.get(sessionId);
        if (buf) {
          buf.clear();
          this.buffers.delete(sessionId);
        }
      }, 5 * 60 * 1000); // 5 minutes
      this.persistSessions();
    });

    // Transport server
    const daemonId = randomUUID();
    const fingerprint = getCertFingerprint(this.config.tls.cert);
    this.transport = new TransportServer(
      {
        port: this.config.port,
        host: this.config.host,
        tls: this.config.tls,
        token: this.config.auth.token,
        daemonId,
        hostname: os.hostname(),
        version: VERSION,
        fingerprint,
      },
      (conn, msg) => this.handleMessage(conn, msg)
    );

    this.transport.setOnConnect((conn) => this.handleClientConnect(conn));
    this.transport.setOnDisconnect(() => {
      // No-op for now — sessions keep running
    });
  }

  async start(): Promise<void> {
    await this.transport.start();

    this.restoreSessions();

    // Periodic buffer persistence (every 60 seconds)
    this.persistTimer = setInterval(() => {
      for (const buf of this.buffers.values()) {
        buf.persistToDisk();
      }
    }, 60_000);

    const fingerprint = getCertFingerprint(this.config.tls.cert);
    console.log(`Switchboard daemon listening on ${this.config.host}:${this.config.port}`);
    console.log(`Connection string: switchboard://${this.config.host}:${this.config.port}?token=${this.config.auth.token}&fingerprint=${fingerprint}`);
    console.log(`Daemon ready.`);
  }

  private restoreSessions(): void {
    const saved = this.sessionStore.load();
    if (saved.length === 0) return;
    let restored = 0;
    for (const s of saved) {
      try {
        const session = this.ptyManager.spawn({
          id: s.id,
          name: s.name,
          cwd: s.cwd,
          command: s.command,
        });
        this.idleDetector.addSession(session.id);
        const bufPath = `${this.config.sessionPersistPath.replace('sessions.json', '')}buffers/${session.id}.buf`;
        const buf = new OutputBuffer(this.config.scrollbackLimit, bufPath);
        this.buffers.set(session.id, buf);
        restored++;
      } catch (err) {
        console.warn(`Failed to restore session ${s.name} (${s.id}): ${err instanceof Error ? err.message : err}`);
      }
    }
    if (restored > 0) {
      console.log(`Restored ${restored} session${restored === 1 ? '' : 's'} from disk.`);
      this.persistSessions();
    }
  }

  async stop(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }

    // Persist all buffers
    for (const buf of this.buffers.values()) {
      buf.persistToDisk();
    }

    this.ptyManager.closeAll();
    await this.transport.stop();
    console.log('Daemon stopped.');
  }

  private handleClientConnect(conn: ClientConnection): void {
    // Send session list with current queue state
    const sessions = this.ptyManager.getAll();
    this.transport.send(conn.id, {
      type: 'session:list',
      sessions,
      queuedPrompts: this.queuedPrompts.snapshot(),
    });

    // Replay buffers for each session
    for (const session of sessions) {
      const buf = this.buffers.get(session.id);
      if (!buf || buf.getLineCount() === 0) continue;

      this.transport.send(conn.id, {
        type: 'replay:begin',
        sessionId: session.id,
        totalBytes: buf.getTotalBytes(),
      });

      for (const chunk of buf.replayChunks()) {
        this.transport.send(conn.id, {
          type: 'replay:data',
          sessionId: session.id,
          data: chunk,
        });
      }

      this.transport.send(conn.id, {
        type: 'replay:end',
        sessionId: session.id,
      });
    }
  }

  private handleMessage(conn: ClientConnection, msg: ClientMessage): void {
    switch (msg.type) {
      case 'session:spawn':
        this.handleSpawn(conn, msg.name, msg.cwd, msg.command);
        break;
      case 'session:input':
        this.handleInput(msg.sessionId, msg.data);
        break;
      case 'session:resize':
        this.handleResize(msg.sessionId, msg.cols, msg.rows);
        break;
      case 'session:close':
        this.handleClose(msg.sessionId);
        break;
      case 'session:rename':
        this.handleRename(msg.sessionId, msg.name);
        break;
      case 'session:list':
        this.transport.send(conn.id, {
          type: 'session:list',
          sessions: this.ptyManager.getAll(),
          queuedPrompts: this.queuedPrompts.snapshot(),
        });
        break;
      case 'session:queue-prompt':
        this.handleQueuePrompt(conn, msg.sessionId, msg.text);
        break;
      case 'session:clear-queue':
        this.handleClearQueue(msg.sessionId);
        break;
      case 'session:replay-request':
        this.handleReplayRequest(conn, msg.sessionId);
        break;
      default:
        this.transport.send(conn.id, {
          type: 'error',
          code: 'UNKNOWN_MESSAGE',
          message: `Unknown message type: ${msg.type}`,
        });
    }
  }

  private handleSpawn(conn: ClientConnection, name: string, cwd: string, command?: string): void {
    try {
      const session = this.ptyManager.spawn({ name, cwd, command });
      this.idleDetector.addSession(session.id);

      // Create output buffer
      const bufPath = `${this.config.sessionPersistPath.replace('sessions.json', '')}buffers/${session.id}.buf`;
      const buf = new OutputBuffer(this.config.scrollbackLimit, bufPath);
      this.buffers.set(session.id, buf);

      // Broadcast to all clients
      this.transport.broadcast({
        type: 'session:created',
        session,
      });

      this.persistSessions();
    } catch (err) {
      this.transport.send(conn.id, {
        type: 'error',
        code: 'SPAWN_FAILED',
        message: err instanceof Error ? err.message : 'Failed to spawn session',
      });
    }
  }

  private handleInput(sessionId: string, data: string): void {
    try {
      this.idleDetector.onInput(sessionId);
      this.ptyManager.write(sessionId, data);
    } catch {
      // Session may have been closed
    }
  }

  private handleResize(sessionId: string, cols: number, rows: number): void {
    try {
      this.ptyManager.resize(sessionId, cols, rows);
    } catch {
      // Ignore resize errors
    }
  }

  private handleClose(sessionId: string): void {
    try {
      this.idleDetector.removeSession(sessionId);
      this.ptyManager.close(sessionId);
      this.queuedPrompts.removeSession(sessionId);
      this.transport.broadcast({
        type: 'session:closed',
        sessionId,
      });
      const buf = this.buffers.get(sessionId);
      if (buf) {
        buf.clear();
        this.buffers.delete(sessionId);
      }
      this.persistSessions();
    } catch {
      // Session may already be closed
    }
  }

  private handleQueuePrompt(conn: ClientConnection, sessionId: string, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      this.transport.send(conn.id, {
        type: 'session:queue-rejected',
        sessionId,
        reason: 'Prompt is empty',
      });
      return;
    }
    const accepted = this.queuedPrompts.tryQueue(sessionId, trimmed);
    if (!accepted) {
      this.transport.send(conn.id, {
        type: 'session:queue-rejected',
        sessionId,
        reason: 'A prompt is already queued for this session',
      });
      return;
    }
    this.transport.broadcast({
      type: 'session:queue-updated',
      sessionId,
      text: trimmed,
    });
  }

  private handleReplayRequest(conn: ClientConnection, sessionId: string): void {
    if (!this.ptyManager.has(sessionId)) {
      this.transport.send(conn.id, {
        type: 'error',
        code: 'UNKNOWN_SESSION',
        message: `Replay requested for unknown session: ${sessionId}`,
      });
      return;
    }
    const buf = this.buffers.get(sessionId);
    const totalBytes = buf?.getTotalBytes() ?? 0;
    this.transport.send(conn.id, {
      type: 'replay:begin',
      sessionId,
      totalBytes,
    });
    if (buf && buf.getLineCount() > 0) {
      for (const chunk of buf.replayChunks()) {
        this.transport.send(conn.id, {
          type: 'replay:data',
          sessionId,
          data: chunk,
        });
      }
    }
    this.transport.send(conn.id, {
      type: 'replay:end',
      sessionId,
    });
  }

  private handleClearQueue(sessionId: string): void {
    if (!this.queuedPrompts.get(sessionId)) return;
    this.queuedPrompts.clear(sessionId);
    this.transport.broadcast({
      type: 'session:queue-updated',
      sessionId,
      text: null,
    });
  }

  private handleRename(sessionId: string, name: string): void {
    try {
      this.ptyManager.rename(sessionId, name);
      this.transport.broadcast({
        type: 'session:renamed',
        sessionId,
        name,
      });
      this.persistSessions();
    } catch {
      // Ignore
    }
  }

  private persistSessions(): void {
    const sessions = this.ptyManager.getAll();
    this.sessionStore.save(
      sessions.map((s) => ({ id: s.id, name: s.name, cwd: s.cwd, command: s.command }))
    );
  }
}

// --- CLI Entry Point ---

if (require.main === module) {
  const daemon = new Daemon();

  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });

  daemon.start().catch((err) => {
    console.error('Failed to start daemon:', err);
    process.exit(1);
  });
}
