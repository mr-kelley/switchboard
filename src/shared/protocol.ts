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

export interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
}

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

export interface PairRequestMessage extends BaseMessage {
  type: 'pair:request';
  clientName: string;
}

export interface PairResponseMessage extends BaseMessage {
  type: 'pair:response';
  code: string;
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

export type ClientMessage =
  | AuthMessage
  | SessionSpawnMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionCloseMessage
  | SessionRenameMessage
  | SessionListRequestMessage
  | PingMessage
  | PairRequestMessage
  | PairResponseMessage
  | SessionQueuePromptMessage
  | SessionClearQueueMessage;

// --- Daemon → Client ---

export interface AuthOkMessage extends BaseMessage {
  type: 'auth:ok';
  daemonId: string;
  hostname: string;
  version: string;
}

export interface AuthFailMessage extends BaseMessage {
  type: 'auth:fail';
  reason: string;
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

export interface PairChallengeMessage extends BaseMessage {
  type: 'pair:challenge';
  daemonName: string;
  hostname: string;
}

export interface PairTokenMessage extends BaseMessage {
  type: 'pair:token';
  token: string;
  daemonId: string;
  hostname: string;
  fingerprint: string;
}

export interface PairFailMessage extends BaseMessage {
  type: 'pair:fail';
  reason: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export type DaemonMessage =
  | AuthOkMessage
  | AuthFailMessage
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
  | PairChallengeMessage
  | PairTokenMessage
  | PairFailMessage
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
