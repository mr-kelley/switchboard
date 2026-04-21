import { describe, it, expect } from 'vitest';
import {
  serializeMessage,
  deserializeMessage,
  SequenceCounter,
  type AuthMessage,
  type SessionDataMessage,
  type SessionListMessage,
  type ErrorMessage,
} from '../../src/shared/protocol';

describe('protocol', () => {
  describe('serializeMessage', () => {
    it('serializes a message to JSON', () => {
      const msg: AuthMessage = { type: 'auth', seq: 1, token: 'abc123' };
      const json = serializeMessage(msg);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('auth');
      expect(parsed.seq).toBe(1);
      expect(parsed.token).toBe('abc123');
    });

    it('serializes complex messages with nested objects', () => {
      const msg: SessionListMessage = {
        type: 'session:list',
        seq: 5,
        sessions: [
          { id: '1', name: 'test', cwd: '/tmp', command: '/bin/bash', pid: 123, status: 'working' },
        ],
      };
      const json = serializeMessage(msg);
      const parsed = JSON.parse(json);
      expect(parsed.sessions).toHaveLength(1);
      expect(parsed.sessions[0].name).toBe('test');
    });
  });

  describe('deserializeMessage', () => {
    it('deserializes valid JSON to a message', () => {
      const json = JSON.stringify({ type: 'ping', seq: 1 });
      const msg = deserializeMessage(json);
      expect(msg.type).toBe('ping');
      expect(msg.seq).toBe(1);
    });

    it('throws on invalid JSON', () => {
      expect(() => deserializeMessage('not json')).toThrow();
    });

    it('throws on missing type field', () => {
      expect(() => deserializeMessage(JSON.stringify({ seq: 1 }))).toThrow('Invalid message');
    });

    it('throws on missing seq field', () => {
      expect(() => deserializeMessage(JSON.stringify({ type: 'ping' }))).toThrow('Invalid message');
    });

    it('throws on non-object input', () => {
      expect(() => deserializeMessage(JSON.stringify('hello'))).toThrow('Invalid message');
    });

    it('throws on null input', () => {
      expect(() => deserializeMessage(JSON.stringify(null))).toThrow('Invalid message');
    });

    it('preserves additional fields', () => {
      const json = JSON.stringify({ type: 'session:data', seq: 3, sessionId: 'abc', data: 'hello' });
      const msg = deserializeMessage(json) as SessionDataMessage;
      expect(msg.sessionId).toBe('abc');
      expect(msg.data).toBe('hello');
    });
  });

  describe('SequenceCounter', () => {
    it('starts at 0', () => {
      const counter = new SequenceCounter();
      expect(counter.current()).toBe(0);
    });

    it('increments monotonically', () => {
      const counter = new SequenceCounter();
      expect(counter.next()).toBe(1);
      expect(counter.next()).toBe(2);
      expect(counter.next()).toBe(3);
    });

    it('current returns the last value from next', () => {
      const counter = new SequenceCounter();
      counter.next();
      counter.next();
      expect(counter.current()).toBe(2);
    });
  });

  describe('message type discriminants', () => {
    it('error message has code and message fields', () => {
      const msg: ErrorMessage = {
        type: 'error',
        seq: 1,
        code: 'SESSION_NOT_FOUND',
        message: 'No such session',
        context: { sessionId: 'abc' },
      };
      const json = serializeMessage(msg);
      const parsed = deserializeMessage(json) as ErrorMessage;
      expect(parsed.code).toBe('SESSION_NOT_FOUND');
      expect(parsed.context?.sessionId).toBe('abc');
    });
  });
});
