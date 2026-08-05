/**
 * Wire protocol message types shared between daemon and client.
 * All messages are JSON objects sent as WebSocket text frames.
 */

// --- Base ---

export interface BaseMessage {
  type: string;
  seq: number;
}

// --- Session types (shared) ---

export type SessionStatus = 'working' | 'idle' | 'needs-attention';

export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  command: string;
  pid: number;
  status: SessionStatus;
}

// --- Client → Daemon ---

export interface SessionSpawnMessage extends BaseMessage {
  type: 'session:spawn';
  name: string;
  cwd: string;
  command?: string;
}

export interface SessionInputMessage extends BaseMessage {
  type: 'session:input';
  sessionId: string;
  data: string;
}

export interface SessionResizeMessage extends BaseMessage {
  type: 'session:resize';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface SessionCloseMessage extends BaseMessage {
  type: 'session:close';
  sessionId: string;
}

export interface SessionRenameMessage extends BaseMessage {
  type: 'session:rename';
  sessionId: string;
  name: string;
}

export interface SessionListRequestMessage extends BaseMessage {
  type: 'session:list';
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export interface SessionQueuePromptMessage extends BaseMessage {
  type: 'session:queue-prompt';
  sessionId: string;
  text: string;
}

export interface SessionClearQueueMessage extends BaseMessage {
  type: 'session:clear-queue';
  sessionId: string;
}

export interface SessionReplayRequestMessage extends BaseMessage {
  type: 'session:replay-request';
  sessionId: string;
}

export type ClientMessage =
  | SessionSpawnMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionCloseMessage
  | SessionRenameMessage
  | SessionListRequestMessage
  | PingMessage
  | SessionQueuePromptMessage
  | SessionClearQueueMessage
  | SessionReplayRequestMessage;

// --- Daemon → Client ---

/**
 * Sent unsolicited by the daemon immediately after a client's mTLS handshake
 * completes. Kept as `auth:ok` for wire-compat with the (now non-existent)
 * bearer-token flow that used the same message shape. No authentication is
 * performed at this layer post-DEC-000010 — TLS is the auth boundary.
 */
export interface AuthOkMessage extends BaseMessage {
  type: 'auth:ok';
  daemonId: string;
  hostname: string;
  version: string;
}

export interface SessionCreatedMessage extends BaseMessage {
  type: 'session:created';
  session: SessionInfo;
}

export interface SessionClosedMessage extends BaseMessage {
  type: 'session:closed';
  sessionId: string;
  exitCode?: number;
}

export interface SessionDataMessage extends BaseMessage {
  type: 'session:data';
  sessionId: string;
  data: string;
}

export interface SessionStatusMessage extends BaseMessage {
  type: 'session:status';
  sessionId: string;
  status: SessionStatus;
}

export interface SessionRenamedMessage extends BaseMessage {
  type: 'session:renamed';
  sessionId: string;
  name: string;
}

export interface SessionListMessage extends BaseMessage {
  type: 'session:list';
  sessions: SessionInfo[];
  queuedPrompts?: Record<string, string>;
}

export interface SessionQueueUpdatedMessage extends BaseMessage {
  type: 'session:queue-updated';
  sessionId: string;
  text: string | null;
}

export interface SessionQueueRejectedMessage extends BaseMessage {
  type: 'session:queue-rejected';
  sessionId: string;
  reason: string;
}

export interface ReplayBeginMessage extends BaseMessage {
  type: 'replay:begin';
  sessionId: string;
  totalBytes: number;
}

export interface ReplayDataMessage extends BaseMessage {
  type: 'replay:data';
  sessionId: string;
  data: string;
}

export interface ReplayEndMessage extends BaseMessage {
  type: 'replay:end';
  sessionId: string;
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export type DaemonMessage =
  | AuthOkMessage
  | SessionCreatedMessage
  | SessionClosedMessage
  | SessionDataMessage
  | SessionStatusMessage
  | SessionRenamedMessage
  | SessionListMessage
  | SessionQueueUpdatedMessage
  | SessionQueueRejectedMessage
  | ReplayBeginMessage
  | ReplayDataMessage
  | ReplayEndMessage
  | PongMessage
  | ErrorMessage;

// --- Serialization ---

export function serializeMessage(msg: BaseMessage): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(raw: string): BaseMessage {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.type !== 'string' || typeof parsed.seq !== 'number') {
    throw new Error('Invalid message: missing type or seq');
  }
  return parsed as BaseMessage;
}

// --- Sequence counter ---

export class SequenceCounter {
  private seq = 0;

  next(): number {
    return ++this.seq;
  }

  current(): number {
    return this.seq;
  }
}
