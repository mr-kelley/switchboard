import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { QueuedPrompts } from '../../src/daemon/queued-prompts';

let tmpDir: string;
let sessionsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-test-'));
  sessionsPath = path.join(tmpDir, 'sessions.json');
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe('QueuedPrompts', () => {
  it('tryQueue accepts on an empty queue and stores the text', () => {
    const qp = new QueuedPrompts(sessionsPath);
    expect(qp.tryQueue('s1', 'hello')).toBe(true);
    expect(qp.get('s1')).toBe('hello');
  });

  it('tryQueue rejects when a prompt is already queued for the session', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'first');
    expect(qp.tryQueue('s1', 'second')).toBe(false);
    expect(qp.get('s1')).toBe('first'); // no overwrite
  });

  it('tryQueue accepts different sessions independently', () => {
    const qp = new QueuedPrompts(sessionsPath);
    expect(qp.tryQueue('s1', 'a')).toBe(true);
    expect(qp.tryQueue('s2', 'b')).toBe(true);
    expect(qp.get('s1')).toBe('a');
    expect(qp.get('s2')).toBe('b');
  });

  it('clear removes a queued prompt', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'hello');
    qp.clear('s1');
    expect(qp.get('s1')).toBeNull();
  });

  it('after clear, tryQueue accepts again', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'first');
    qp.clear('s1');
    expect(qp.tryQueue('s1', 'second')).toBe(true);
    expect(qp.get('s1')).toBe('second');
  });

  it('consume returns and removes the prompt', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'hello');
    expect(qp.consume('s1')).toBe('hello');
    expect(qp.get('s1')).toBeNull();
  });

  it('consume returns null when no prompt queued', () => {
    const qp = new QueuedPrompts(sessionsPath);
    expect(qp.consume('unknown')).toBeNull();
  });

  it('snapshot returns all queued prompts', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'a');
    qp.tryQueue('s2', 'b');
    expect(qp.snapshot()).toEqual({ s1: 'a', s2: 'b' });
  });

  it('persists to disk and reloads on new instance', () => {
    const qp1 = new QueuedPrompts(sessionsPath);
    qp1.tryQueue('s1', 'persisted');

    const qp2 = new QueuedPrompts(sessionsPath);
    expect(qp2.get('s1')).toBe('persisted');
  });

  it('consume + reload sees the cleared state', () => {
    const qp1 = new QueuedPrompts(sessionsPath);
    qp1.tryQueue('s1', 'x');
    qp1.consume('s1');

    const qp2 = new QueuedPrompts(sessionsPath);
    expect(qp2.get('s1')).toBeNull();
  });

  it('removeSession wipes any queued prompt for that session', () => {
    const qp = new QueuedPrompts(sessionsPath);
    qp.tryQueue('s1', 'x');
    qp.removeSession('s1');
    expect(qp.get('s1')).toBeNull();
  });

  it('ignores corrupt on-disk data', () => {
    const filePath = path.join(path.dirname(sessionsPath), 'queued-prompts.json');
    fs.writeFileSync(filePath, '{ not json]');
    const qp = new QueuedPrompts(sessionsPath);
    expect(qp.snapshot()).toEqual({});
  });
});
