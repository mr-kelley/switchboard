import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleDetector } from '../../src/daemon/idle-detector';

describe('IdleDetector', () => {
  let detector: IdleDetector;
  let statusChanges: Array<{ sessionId: string; status: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    statusChanges = [];
    detector = new IdleDetector((sessionId, status) => {
      statusChanges.push({ sessionId, status });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts sessions in working status', () => {
    detector.addSession('s1');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('transitions to idle after no output for idle timeout', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'some output');
    vi.advanceTimersByTime(10_000);
    expect(detector.getStatus('s1')).toBe('idle');
    expect(statusChanges).toContainEqual({ sessionId: 's1', status: 'idle' });
  });

  it('detects needs-attention on prompt pattern after min activity duration', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'working...');
    vi.advanceTimersByTime(2_500); // past MIN_ACTIVITY_MS
    detector.onOutput('s1', '$ ');
    expect(detector.getStatus('s1')).toBe('needs-attention');
  });

  it('does not detect needs-attention before min activity duration', () => {
    detector.addSession('s1');
    detector.onOutput('s1', '$ ');
    // Too soon — should still be working
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('transitions back to working on new output after idle', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'data');
    vi.advanceTimersByTime(10_000);
    expect(detector.getStatus('s1')).toBe('idle');

    detector.onOutput('s1', 'new data');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('transitions to working on input', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'data');
    vi.advanceTimersByTime(2_500);
    detector.onOutput('s1', '$ ');
    expect(detector.getStatus('s1')).toBe('needs-attention');

    detector.onInput('s1');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('removeSession cleans up timers', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'data');
    detector.removeSession('s1');
    expect(detector.getStatus('s1')).toBeUndefined();
  });

  it('returns undefined status for unknown session', () => {
    expect(detector.getStatus('nonexistent')).toBeUndefined();
  });

  it('ignores output for unknown session', () => {
    detector.onOutput('nonexistent', 'data');
    expect(statusChanges).toHaveLength(0);
  });
});
