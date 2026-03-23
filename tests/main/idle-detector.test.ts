import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleDetector } from '../../src/main/idle-detector';

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

  it('starts a session in working state', () => {
    detector.addSession('s1');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('output keeps status as working', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'some output');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('transitions to idle after 10s of no output', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'some output');

    vi.advanceTimersByTime(10_000);

    expect(detector.getStatus('s1')).toBe('idle');
    expect(statusChanges).toContainEqual({ sessionId: 's1', status: 'idle' });
  });

  it('resets idle timer on new output', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'output 1');

    vi.advanceTimersByTime(5_000);
    detector.onOutput('s1', 'output 2');

    vi.advanceTimersByTime(5_000);
    // Should NOT be idle yet (timer was reset)
    expect(detector.getStatus('s1')).toBe('working');

    vi.advanceTimersByTime(5_000);
    // Now should be idle (10s since last output)
    expect(detector.getStatus('s1')).toBe('idle');
  });

  it('transitions idle to working on new output', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'output');

    vi.advanceTimersByTime(10_000);
    expect(detector.getStatus('s1')).toBe('idle');

    detector.onOutput('s1', 'new output');
    expect(detector.getStatus('s1')).toBe('working');
    expect(statusChanges).toContainEqual({ sessionId: 's1', status: 'working' });
  });

  it('detects prompt pattern after 2s of activity', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'working on things...\n');

    vi.advanceTimersByTime(2_000);
    detector.onOutput('s1', '> \n');

    expect(detector.getStatus('s1')).toBe('needs-attention');
    expect(statusChanges).toContainEqual({ sessionId: 's1', status: 'needs-attention' });
  });

  it('does not detect prompt pattern before 2s of activity', () => {
    detector.addSession('s1');
    detector.onOutput('s1', '> \n');

    // First output was the prompt itself — less than 2s of activity
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('matches various prompt patterns', () => {
    const prompts = ['> \n', '❯ \n', '$ \n', '# \n'];
    for (const prompt of prompts) {
      const d = new IdleDetector(vi.fn());
      d.addSession('s1');
      d.onOutput('s1', 'activity\n');
      vi.advanceTimersByTime(2_000);
      d.onOutput('s1', prompt);
      expect(d.getStatus('s1')).toBe('needs-attention');
      d.removeSession('s1');
    }
  });

  it('user input resets from needs-attention to working', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'output\n');

    vi.advanceTimersByTime(2_000);
    detector.onOutput('s1', '> \n');
    expect(detector.getStatus('s1')).toBe('needs-attention');

    detector.onInput('s1');
    expect(detector.getStatus('s1')).toBe('working');
  });

  it('removeSession clears timers', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'output');
    detector.removeSession('s1');

    vi.advanceTimersByTime(10_000);
    // Should not crash or fire callback
    expect(statusChanges).toHaveLength(0);
  });

  it('tracks multiple sessions independently', () => {
    detector.addSession('s1');
    detector.addSession('s2');
    detector.onOutput('s1', 'output');
    detector.onOutput('s2', 'output');

    vi.advanceTimersByTime(2_000);
    detector.onOutput('s1', '> \n');

    expect(detector.getStatus('s1')).toBe('needs-attention');
    expect(detector.getStatus('s2')).toBe('working');
  });

  it('does not fire duplicate status changes', () => {
    detector.addSession('s1');
    detector.onOutput('s1', 'output');

    vi.advanceTimersByTime(10_000);
    expect(statusChanges.filter((c) => c.status === 'idle')).toHaveLength(1);
  });
});
